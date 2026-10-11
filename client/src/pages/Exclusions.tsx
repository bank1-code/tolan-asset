import { remainingQuantity } from "@shared/inventoryQuantity";
/*
 * Design: Calm Luxury - استبعادات الأصول والعهد
 * تبويبات علوية: أصول / عهد
 * استبعاد موحد بالكمية المطلوبة / إدارة الاستبعادات
 * كل تبويب استبعاد يحتوي 5 تبويبات ذكية متسلسلة
 * مربوطة بالـ API الحقيقي عبر tRPC
 */
import ExclusionHistory from "@/components/ExclusionHistory";
import DashboardLayout from "@/components/DashboardLayout";
import WorkflowConfirmationDialog from "@/components/WorkflowConfirmationDialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { printExclusionReport } from "@/lib/exclusionReport";
import { isDisplayImageUrl } from "@shared/imageUrls";
import {
  AlertTriangle, Box, CheckCircle2, ChevronLeft, ChevronRight,
  Eye, FileText, ImagePlus, Loader2, Package, Printer, RefreshCw, Search,
  Trash2, Users, X, XCircle
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

/* ─── واجهات ─── */
interface ResponsiblePerson { job: string; name: string; }
interface AttachedImage { id: string; name: string; preview: string; url?: string; uploading?: boolean; uploadError?: boolean; }

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ─── مكون التبويبات الذكية (5 خطوات) ─── */
function SmartTabs({ activeTab, maxAllowed, onTabChange, tabs }: {
  activeTab: number; maxAllowed: number; onTabChange: (idx: number) => void; tabs: string[];
}) {
  return (
    <div className="flex border-b border-border mb-4 overflow-x-auto">
      {tabs.map((label, idx) => (
        <button
          key={idx}
          onClick={() => {
            if (idx <= maxAllowed) onTabChange(idx);
            else toast.warning("أكمل بيانات التبويب الحالي قبل الانتقال للتالي");
          }}
          className={`px-4 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 transition-all ${
            activeTab === idx
              ? "border-primary text-primary bg-primary/5"
              : idx <= maxAllowed
              ? "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30"
              : "border-transparent text-muted-foreground/40 cursor-not-allowed"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   مكون الاستبعاد العام (يعمل للأصول والعهد) - مربوط بالـ API
   ═══════════════════════════════════════════════════════════════ */
function ExclusionWizard({ category }: { category: "asset" | "custody" }) {
  const isAsset = category === "asset";
  const itemLabel = isAsset ? "الأصل" : "العهدة";
  const codeLabel = isAsset ? "رمز الأصل" : "رمز العهدة";

  const { data: assetsData } = trpc.inventory.assets.list.useQuery({});
  const { data: custodyData } = trpc.inventory.custody.list.useQuery({});
  const { data: exclusionTypesData } = trpc.settings.exclusionTypes.list.useQuery();
  const { data: draftsData } = trpc.operations.exclusions.drafts.useQuery();
  const saveDraftMutation = trpc.operations.exclusions.saveDraft.useMutation();
  const deleteDraftMutation = trpc.operations.exclusions.deleteDraft.useMutation();

  const utils = trpc.useUtils();
  const createExclusion = trpc.operations.exclusions.create.useMutation({
    onSuccess: () => {
      utils.operations.exclusions.list.invalidate();
      utils.inventory.assets.list.invalidate();
      utils.inventory.custody.list.invalidate();
      utils.operations.exclusions.drafts.invalidate();
    },
  });
  const uploadImage = trpc.upload.image.useMutation();

  const allItems = isAsset ? (assetsData || []) : (custodyData || []);
  const exclusionTypes = exclusionTypesData || [];

  const [searchCode, setSearchCode] = useState("");
  const [foundItem, setFoundItem] = useState<any>(null);
  const [searchDone, setSearchDone] = useState(false);
  const [searchMatches, setSearchMatches] = useState<any[]>([]);

  // التبويبات الذكية
  const [activeTab, setActiveTab] = useState(0);
  const [maxAllowed, setMaxAllowed] = useState(0);

  // بيانات الاستبعاد
  const [excludeQty, setExcludeQty] = useState("");
  const [exclusionType, setExclusionType] = useState("");
  const [reason, setReason] = useState("");
  const [responsibleCount, setResponsibleCount] = useState("");
  const [responsibles, setResponsibles] = useState<ResponsiblePerson[]>([]);
  const [signaturesGenerated, setSignaturesGenerated] = useState(false);

  // الصور
  const [images, setImages] = useState<AttachedImage[]>([]);

  // المسودة والتنفيذ
  const [draftSaved, setDraftSaved] = useState(false);
  const [executed, setExecuted] = useState(false);
  const [executionCode, setExecutionCode] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [draftId, setDraftId] = useState<number>();
  const [effectiveDate, setEffectiveDate] = useState(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date()));
  const [executionRecord, setExecutionRecord] = useState<any>(null);
  const [executionConfirmation, setExecutionConfirmation] = useState(false);
  const executionPending = useRef(false);
  const availableQuantity = Math.max(0, foundItem ? remainingQuantity(foundItem) : 0);
  const mode: "partial" | "full" = Number(excludeQty) === availableQuantity && availableQuantity > 0 ? "full" : "partial";
  const isPartial = mode === "partial";
  const busy = saveDraftMutation.isPending || deleteDraftMutation.isPending || createExclusion.isPending;

  const tabLabels = [
    `1) بيانات ${itemLabel}`,
    "2) بيانات الاستبعاد",
    "3) مرفقات الصور",
    "4) المسؤولون",
    "5) المراجعة والتنفيذ"
  ];

  const allowNextTab = useCallback((idx: number) => {
    setMaxAllowed(prev => Math.max(prev, idx));
    setActiveTab(idx);
  }, []);

  /* ─── البحث ─── */
  const handleSearch = () => {
    if (busy) return;
    if (!searchCode.trim()) { toast.warning(`أدخل ${codeLabel}`); return; }
    const matches = allItems.filter((a: any) => {
      const itemCode = isAsset ? a.assetCode : a.code;
      return (itemCode || "").toLowerCase() === searchCode.trim().toLowerCase();
    });
    if (matches.length > 1) { setFoundItem(null); setSearchDone(true); setSearchMatches(matches); toast.warning("الرقم مكرر في السجلات القديمة؛ اختر السجل المقصود من النتائج"); return; }
    selectItem(matches[0]);
  };
  const selectItem = (item: any) => {
    setSearchMatches([]);
    setSearchDone(true);
    if (!item) { setFoundItem(null); return; }
    if ((item as any).status !== "ACTIVE" || remainingQuantity(item as any) <= 0) {
      setFoundItem(null);
      toast.error(`${itemLabel} غير نشط أو كميته صفر ولا يمكن استبعاده`);
      return;
    }
    setDraftId(undefined); setExecutionRecord(null);
    setEffectiveDate(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date()));
    setFoundItem(item);
    setActiveTab(0); setMaxAllowed(0); setDraftSaved(false); setExecuted(false);
    setExcludeQty("");
    setExclusionType(""); setReason(""); setResponsibleCount("");
    setResponsibles([]); setSignaturesGenerated(false); setImages([]); setIsEditing(false);
  };

  /* ─── التحقق من بيانات الاستبعاد ─── */
  const validateExclusionData = (): boolean => {
    {
      const qty = Number(excludeQty);
      if (!Number.isInteger(qty) || qty <= 0) { toast.warning("الكمية يجب أن تكون عددًا صحيحًا أكبر من صفر"); return false; }
      if (foundItem && qty > availableQuantity) { toast.warning(`لا يمكن استبعاد كمية أكبر من الحالية (${availableQuantity})`); return false; }
    }
    if (!effectiveDate) { toast.warning("حدد تاريخ سريان الاستبعاد"); return false; }
    if (!exclusionType) { toast.warning("حدد نوع الاستبعاد"); return false; }
    if (!reason.trim() || reason.trim().length < 5) { toast.warning("سبب الاستبعاد يجب أن يكون مفصلاً (5 أحرف على الأقل)"); return false; }
    const count = parseInt(responsibleCount);
    if (!count || count < 1 || count > 6) { toast.warning("عدد المسؤولين يجب أن يكون بين 1 و 6"); return false; }
    return true;
  };

  /* ─── التحقق من التواقيع ─── */
  const validateSignatures = (): boolean => {
    if (!signaturesGenerated || responsibles.length === 0) { toast.warning("يجب توليد خانات التواقيع أولاً"); return false; }
    for (let i = 0; i < responsibles.length; i++) {
      if (!responsibles[i].job.trim() || responsibles[i].job.trim().length < 2) { toast.warning(`أدخل الوظيفة للمسؤول رقم ${i + 1}`); return false; }
      if (!responsibles[i].name.trim() || responsibles[i].name.trim().length < 3) { toast.warning(`أدخل الاسم الكامل للمسؤول رقم ${i + 1}`); return false; }
    }
    return true;
  };

  /* ─── توليد خانات التواقيع ─── */
  const generateSignatures = () => {
    const count = parseInt(responsibleCount);
    if (!count || count < 1 || count > 6) { toast.warning("عدد المسؤولين يجب أن يكون بين 1 و 6"); return; }
    const newR: ResponsiblePerson[] = [];
    for (let i = 0; i < count; i++) newR.push({ job: responsibles[i]?.job || "", name: responsibles[i]?.name || "" });
    setResponsibles(newR); setSignaturesGenerated(true);
  };

  /* ─── التحقق من اكتمال رفع الصور ─── */
  const validateImageUploads = (): boolean => {
    if (images.some(img => img.uploading)) {
      toast.warning("يرجى الانتظار حتى يكتمل رفع جميع الصور");
      return false;
    }
    if (images.some(img => !img.url || img.uploadError)) {
      toast.error("تعذر رفع إحدى الصور. احذف الصورة التي فشل رفعها ثم أعد إضافتها");
      return false;
    }
    return true;
  };

  /* ─── إضافة صورة ورفعها عبر رافع الصور المعتمد ─── */
  const handleAddImage = () => {
    if (images.length >= 6) { toast.warning("الحد الأقصى لعدد الصور هو 6 صور فقط"); return; }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/jpg,image/webp";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) {
        toast.error("حجم الصورة يتجاوز الحد المسموح (10 ميجابايت)");
        return;
      }

      const imgId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      try {
        const base64 = await fileToBase64(file);
        // الـ Base64 للمعاينة والرفع فقط، ولا يُرسل أبداً مع سجل الاستبعاد.
        setImages(prev => [...prev, {
          id: imgId,
          name: file.name,
          preview: base64,
          uploading: true,
          uploadError: false,
        }]);

        const result = await uploadImage.mutateAsync({
          base64,
          category: "exclusion",
        });

        // بعد نجاح الرفع نحتفظ بالرابط فقط كمعاينة ومرفق للعملية.
        setImages(prev => prev.map(img => img.id === imgId
          ? { ...img, preview: result.url, url: result.url, uploading: false, uploadError: false }
          : img));
      } catch (error: any) {
        setImages(prev => prev.map(img => img.id === imgId
          ? { ...img, uploading: false, uploadError: true }
          : img));
        toast.error(error?.message || "فشل رفع الصورة");
      }
    };
    input.click();
  };

  const buildPayload = () => ({
    entityType: category, entityId: foundItem.id, exclusionMode: mode,
    exclusionTypeId: exclusionTypes.find((t: any) => t.name === exclusionType)!.id,
    reason, quantityExcluded: Number(excludeQty),
    effectiveDate, responsibleData: responsibles,
    exclusionImages: images.map(i => i.url).filter((url): url is string => Boolean(url)), draftId,
  });
  const saveDraft = async () => {
    if (busy || executed || !validateExclusionData() || !validateSignatures() || !validateImageUploads()) return;
    try {
      const result = await saveDraftMutation.mutateAsync(buildPayload());
      setDraftId(result.id); setDraftSaved(true); setIsEditing(false);
      utils.operations.exclusions.drafts.invalidate();
      toast.success("تم حفظ المسودة في النظام ويمكن استكمالها لاحقًا");
    } catch (error: any) { toast.error(error.message || "فشل حفظ المسودة"); }
  };
  const executeExclusion = async () => {
    if (busy || executed || executionPending.current || !validateExclusionData() || !validateSignatures() || !validateImageUploads()) return;
    executionPending.current = true;
    try {
      const result = await createExclusion.mutateAsync(buildPayload());
      setExecutionRecord(result.record); setExecutionCode(result.record.exclusionCode);
      setExecuted(true); setDraftSaved(false); setDraftId(undefined);
      toast.success("تم تنفيذ الاستبعاد: " + result.record.exclusionCode + " — المتبقي: " + result.record.quantityRemaining);
    } catch (error: any) { toast.error(error.message || "حدث خطأ أثناء تنفيذ الاستبعاد"); }
    finally { executionPending.current = false; setExecutionConfirmation(false); }
  };
  const restoreDraft = (draft: any) => {
    const data = draft.payload;
    const item: any = allItems.find((item: any) => item.id === data.entityId);
    if (!item || item.status !== "ACTIVE" || remainingQuantity(item) <= 0) {
      toast.error("السجل غير موجود أو مستبعد بالكامل؛ يمكن إلغاء المسودة"); return;
    }
    setFoundItem(item); setSearchCode((isAsset ? item.assetCode : item.code) || "");
    setDraftId(draft.id); setEffectiveDate(data.effectiveDate); setExcludeQty(String(data.quantityExcluded));
    setExclusionType(exclusionTypes.find((t: any) => t.id === data.exclusionTypeId)?.name || "");
    setReason(data.reason); setResponsibles(data.responsibleData); setResponsibleCount(String(data.responsibleData.length));
    setImages(data.exclusionImages.map((url: string, i: number) => ({ id: String(i), name: "صورة محفوظة", url, preview: url })));
    setSignaturesGenerated(true); setDraftSaved(true); setIsEditing(false); setExecuted(false); setExecutionRecord(null);
    setMaxAllowed(4); setActiveTab(4);
  };

  const cancelDraft = async () => {
    if (busy) return;
    if (draftId) {
      try { await deleteDraftMutation.mutateAsync({ id: draftId }); }
      catch (error: any) { toast.error(error.message); return; }
      utils.operations.exclusions.drafts.invalidate();
    }
    setDraftId(undefined);
    setExcludeQty("");
    setExclusionType(""); setReason(""); setResponsibleCount(""); setResponsibles([]);
    setSignaturesGenerated(false); setImages([]); setDraftSaved(false); setIsEditing(false);
  };

  return (
    <div className="space-y-4">
      {/* عنوان */}
      <div className="text-center py-2">
        <h3 className={`text-base font-bold ${isPartial ? "text-amber-600" : "text-red-600"}`}>
          {`استبعاد ${itemLabel}`}
        </h3>
      </div>

      {/* البحث */}
      <div className="flex items-center gap-3 bg-muted/30 rounded-xl p-3 border border-border">
        <label className="text-xs font-bold text-foreground whitespace-nowrap">{codeLabel}:</label>
        <input
          type="text" value={searchCode}
          onChange={(e) => setSearchCode(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder={`أدخل ${codeLabel}...`}
          className="flex-1 h-9 px-3 rounded-lg bg-background border border-border text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
          dir="ltr"
        />
        <Button size="sm" className="h-9 text-xs gap-1.5" disabled={busy} onClick={handleSearch}>
          <Search className="w-3.5 h-3.5" /> بحث
        </Button>
      </div>

      {/* نتيجة البحث */}
      {searchMatches.length > 1 && <div className="border rounded-xl p-3 space-y-2"><p className="text-xs">أكثر من سجل يحمل الرقم نفسه. اختر السجل بناءً على اسمه وموقعه والموظف.</p>{searchMatches.map(item => <Button key={item.id} variant="outline" className="w-full justify-start text-xs" onClick={() => selectItem(item)} disabled={item.status !== "ACTIVE" || remainingQuantity(item) <= 0}>#{item.id} · {isAsset ? item.assetName : item.name} · {item.locationName || "—"} · {item.employeeName || "—"} · المتبقي {remainingQuantity(item)}</Button>)}</div>}
      {searchDone && !foundItem && searchMatches.length === 0 && (
        <div className="flex items-center gap-2 bg-destructive/10 text-destructive rounded-xl p-4 border border-destructive/20">
          <XCircle className="w-4 h-4" />
          <span className="text-sm font-bold">لا يوجد {itemLabel} بهذا الرمز أو الكمية صفر</span>
        </div>
      )}

      <div className="mb-4 space-y-2">
        {(draftsData || []).filter((draft: any) => draft.payload.entityType === category).map((draft: any) => (
          <div key={draft.id} className="flex flex-wrap items-center gap-2 border rounded-lg p-3 text-xs">
            <span>مسودة #{draft.id} — {draft.payload.reason}</span>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => restoreDraft(draft)}>استكمال المسودة</Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={async () => {
              if (!confirm("إلغاء المسودة المحفوظة؟")) return;
              try { await deleteDraftMutation.mutateAsync({ id: draft.id });
                utils.operations.exclusions.drafts.invalidate();
                if (draftId === draft.id) { setDraftId(undefined); setDraftSaved(false); }
              } catch (error: any) { toast.error(error.message); }
            }}>إلغاء المسودة</Button>
          </div>
        ))}
      </div>
      {foundItem && (
        <>
          <div className="bg-card rounded-xl border p-4 mb-4 grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">{[
 [codeLabel, (isAsset ? foundItem.assetCode : foundItem.code) || "—"], ["الاسم", (isAsset ? foundItem.assetName : foundItem.name)],
 ["الموقع", foundItem.locationName || "—"], ["القسم", foundItem.departmentName || "—"], ["الموظف", foundItem.employeeName || "—"],
 ["الحالة", executionRecord ? (executionRecord.quantityRemaining === 0 ? "مستبعد بالكامل" : "نشط") : (foundItem.status === "ACTIVE" ? "نشط" : foundItem.status)], ["الكمية الأصلية", String(foundItem.quantity)], [executionRecord ? "المستبعد إجمالاً" : "المستبعد سابقاً", String(executionRecord ? executionRecord.previouslyExcluded + executionRecord.quantityExcluded : foundItem.excludedQuantity || 0)], ["المستبدل بالضمان", String(foundItem.warrantyReplacedQuantity || 0)], ["المتبقي الفعلي", String(executionRecord ? executionRecord.quantityRemaining : availableQuantity)]
].map(([label,value]) => <div key={label}><span className="text-muted-foreground">{label}: </span><strong>{value}</strong></div>)}</div>
          <SmartTabs activeTab={executed ? 4 : activeTab} maxAllowed={maxAllowed} onTabChange={idx => { if (!executed && !busy) setActiveTab(idx); }} tabs={tabLabels} />

          {/* ─── تبويب 1: بيانات العنصر ─── */}
          {activeTab === 0 && (
            <div className="space-y-4">
              <div className="bg-card rounded-xl border border-border p-5">
                <h4 className="text-sm font-bold text-foreground mb-4 pb-2 border-b border-border flex items-center gap-2">
                  {isAsset ? <Box className="w-4 h-4 text-primary" /> : <Package className="w-4 h-4 text-primary" />}
                  بيانات {itemLabel}
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    [codeLabel, (isAsset ? foundItem.assetCode : foundItem.code) || "—"],
                    [`اسم ${itemLabel}`, (isAsset ? foundItem.assetName : foundItem.name) || "—"],
                    ["الكمية الأصلية", String(foundItem.quantity)],
                    ["المستبعد سابقًا", String(foundItem.excludedQuantity || 0)],
                    ["المتبقي الفعلي", String(availableQuantity)],
                    ["القيمة", `${Number(foundItem.assetValue || 0).toLocaleString()} ريال`],
                    ["المسؤول", foundItem.employeeName || "—"],
                    ["القسم", foundItem.departmentName || "—"],
                    ["الموقع", foundItem.locationName || "—"],
                    ["الحالة", foundItem.status === "ACTIVE" ? "نشط" : foundItem.status === "EXCLUDED" ? "مستبعد" : foundItem.status],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground min-w-[100px]">{label}:</span>
                      <span className="text-sm font-bold text-foreground">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex justify-start">
                <Button onClick={() => allowNextTab(1)} className="gap-1.5">
                  التالي <ChevronLeft className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}

          {/* ─── تبويب 2: بيانات الاستبعاد ─── */}
          {activeTab === 1 && (
            <div className="space-y-4">
              <div className="bg-card rounded-xl border border-border p-5">
                <h4 className="text-sm font-bold text-foreground mb-4 pb-2 border-b border-border">بيانات الاستبعاد</h4>
                <div className="space-y-4">
                  <label className="block text-xs font-bold">تاريخ سريان الاستبعاد
                    <input type="date" value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)} disabled={busy || executed || (draftSaved && !isEditing)} className="block h-9 border rounded px-3 mt-2" />
                  </label>
                  {(
                    <div>
                      <label className="text-xs font-bold text-foreground mb-1 block">الكمية المراد استبعادها (الحالية: {availableQuantity}):</label>
                      <input type="number" value={excludeQty} onChange={(e) => setExcludeQty(e.target.value)}
                        min="1" max={availableQuantity} disabled={busy || executed || (draftSaved && !isEditing)}
                        className="w-full h-9 px-3 rounded-lg bg-muted/40 border border-border text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50" />
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">أدخل الكمية المطلوبة من المتبقي ({availableQuantity}). استبعاد كامل المتبقي يقفل السجل تلقائياً.</p>
                  <div>
                    <label className="text-xs font-bold text-foreground mb-1 block">نوع الاستبعاد:</label>
                    <Select value={exclusionType} onValueChange={setExclusionType} disabled={busy || executed || (draftSaved && !isEditing)}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر نوع الاستبعاد..." /></SelectTrigger>
                      <SelectContent>
                        {exclusionTypes.map((t: any) => <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-foreground mb-1 block">سبب الاستبعاد (تفصيلي):</label>
                    <textarea value={reason} onChange={(e) => setReason(e.target.value)} disabled={busy || executed || (draftSaved && !isEditing)}
                      rows={3} placeholder="اكتب سبب الاستبعاد بالتفصيل..."
                      className="w-full px-3 py-2 rounded-lg bg-muted/40 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50 resize-none" />
                  </div>
                  <div className="flex items-end gap-3">
                    <div className="flex-1">
                      <label className="text-xs font-bold text-foreground mb-1 block">عدد المسؤولين عن الاستبعاد (1-6):</label>
                      <input type="number" value={responsibleCount} onChange={(e) => setResponsibleCount(e.target.value)}
                        min="1" max="6" disabled={busy || executed || (draftSaved && !isEditing)}
                        className="w-full h-9 px-3 rounded-lg bg-muted/40 border border-border text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50" />
                    </div>
                    <Button size="sm" variant="outline" className="h-9 text-xs gap-1.5" onClick={generateSignatures} disabled={busy || executed || (draftSaved && !isEditing)}>
                      <Users className="w-3.5 h-3.5" /> توليد خانات التواقيع
                    </Button>
                  </div>
                </div>
              </div>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setActiveTab(0)} className="gap-1.5">
                  <ChevronRight className="w-3.5 h-3.5" /> السابق
                </Button>
                <Button onClick={() => { if (validateExclusionData()) allowNextTab(2); }} className="gap-1.5">
                  التالي <ChevronLeft className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}

          {/* ─── تبويب 3: مرفقات الصور ─── */}
          {activeTab === 2 && (
            <div className="space-y-4">
              <div className="bg-card rounded-xl border border-border p-5">
                <h4 className="text-sm font-bold text-foreground mb-4 pb-2 border-b border-border flex items-center gap-2">
                  <ImagePlus className="w-4 h-4 text-primary" /> مرفقات الصور (اختياري - حد أقصى 6)
                </h4>
                <div className="flex flex-wrap gap-3 mb-4">
                  {images.map((img) => (
                    <div key={img.id} className="relative group w-24 h-24 rounded-lg overflow-hidden border border-border">
                      <img src={img.preview} alt={img.name} className="w-full h-full object-cover" />
                      {img.uploading && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                          <Loader2 className="w-5 h-5 text-white animate-spin" />
                        </div>
                      )}
                      {img.url && !img.uploading && !img.uploadError && (
                        <div className="absolute top-1 right-1 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center">
                          <CheckCircle2 className="w-3 h-3 text-white" />
                        </div>
                      )}
                      {img.uploadError && !img.uploading && (
                        <div className="absolute inset-0 bg-destructive/70 flex flex-col items-center justify-center gap-1 text-white text-[9px] text-center px-1">
                          <XCircle className="w-5 h-5" />
                          <span>فشل الرفع</span>
                        </div>
                      )}
                      <button onClick={() => setImages(prev => prev.filter(i => i.id !== img.id))}
                        className="absolute top-1 left-1 w-5 h-5 bg-destructive text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <X className="w-3 h-3" />
                      </button>
                      <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[8px] px-1 py-0.5 truncate">{img.name}</div>
                    </div>
                  ))}
                </div>
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={handleAddImage} disabled={images.length >= 6 || (draftSaved && !isEditing)}>
                  <ImagePlus className="w-3.5 h-3.5" /> إضافة صورة ({images.length}/6)
                </Button>
                {images.some(img => img.uploading) && (
                  <p className="mt-2 text-[11px] text-amber-600 flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> جاري رفع الصور وتحويلها إلى WebP...
                  </p>
                )}
                {images.some(img => img.uploadError) && (
                  <p className="mt-2 text-[11px] text-destructive flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" /> توجد صورة فشل رفعها. احذفها ثم أعد إضافتها قبل المتابعة.
                  </p>
                )}
              </div>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setActiveTab(1)} className="gap-1.5">
                  <ChevronRight className="w-3.5 h-3.5" /> السابق
                </Button>
                <Button onClick={() => { if (validateImageUploads()) allowNextTab(3); }} className="gap-1.5">
                  التالي <ChevronLeft className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}

          {/* ─── تبويب 4: المسؤولون ─── */}
          {activeTab === 3 && (
            <div className="space-y-4">
              <div className="bg-card rounded-xl border border-border p-5">
                <h4 className="text-sm font-bold text-foreground mb-4 pb-2 border-b border-border flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" /> المسؤولون عن الاستبعاد
                </h4>
                {!signaturesGenerated ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    سيتم عرض خانات التواقيع هنا بعد تحديد عدد المسؤولين ثم الضغط على زر (توليد خانات التواقيع) في تبويب بيانات الاستبعاد
                  </div>
                ) : (
                  <div className="space-y-4">
                    {Array.from({ length: Math.ceil(responsibles.length / 3) }, (_, groupIdx) => {
                      const group = responsibles.slice(groupIdx * 3, (groupIdx + 1) * 3);
                      return (
                        <div key={groupIdx}>
                          {Math.ceil(responsibles.length / 3) > 1 && (
                            <p className="text-xs font-bold text-amber-600 mb-2">المجموعة {groupIdx + 1}</p>
                          )}
                          <div className="grid grid-cols-3 gap-4">
                            {group.map((resp, respIdx) => {
                              const globalIdx = groupIdx * 3 + respIdx;
                              return (
                                <div key={globalIdx} className="space-y-2">
                                  <div>
                                    <label className="text-[10px] text-muted-foreground">وظيفة {globalIdx + 1}:</label>
                                    <input type="text" value={resp.job}
                                      onChange={(e) => { const u = [...responsibles]; u[globalIdx] = { ...u[globalIdx], job: e.target.value }; setResponsibles(u); }}
                                      disabled={busy || executed || (draftSaved && !isEditing)}
                                      className="w-full h-8 px-2 rounded-lg bg-muted/40 border border-border text-xs text-center focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50" />
                                  </div>
                                  <div>
                                    <label className="text-[10px] text-muted-foreground">اسم {globalIdx + 1}:</label>
                                    <input type="text" value={resp.name}
                                      onChange={(e) => { const u = [...responsibles]; u[globalIdx] = { ...u[globalIdx], name: e.target.value }; setResponsibles(u); }}
                                      disabled={busy || executed || (draftSaved && !isEditing)}
                                      className="w-full h-8 px-2 rounded-lg bg-muted/40 border border-border text-xs text-center focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50" />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setActiveTab(2)} className="gap-1.5">
                  <ChevronRight className="w-3.5 h-3.5" /> السابق
                </Button>
                <Button onClick={() => { if (validateSignatures()) allowNextTab(4); }} className="gap-1.5">
                  التالي <ChevronLeft className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}

          {/* ─── تبويب 5: المراجعة والتنفيذ ─── */}
          {activeTab === 4 && (
            <div className="space-y-4">
              <div className="bg-card rounded-xl border border-border p-5">
                <h4 className="text-sm font-bold text-foreground mb-4 pb-2 border-b border-border">المراجعة والتنفيذ</h4>
                <p className="text-xs text-muted-foreground mb-4">
                  بعد إكمال التبويبات السابقة يمكنك هنا حفظ المسودة أو تنفيذ الاستبعاد.
                  تأكد من صحة الكمية، السبب، بيانات المسؤولين، وأي مرفقات قبل التنفيذ.
                </p>
                {/* ملخص */}
                <div className="bg-muted/30 rounded-xl p-4 space-y-2 mb-4">
                  {[
                    [itemLabel, `${(isAsset ? foundItem.assetCode : foundItem.code) || "—"} - ${(isAsset ? foundItem.assetName : foundItem.name) || "—"}`],
                    [executionRecord ? "الحالة قبل التنفيذ" : "الحالة الحالية", foundItem.status === "ACTIVE" ? "نشط" : foundItem.status],
                    ["مدى الاستبعاد المحسوب", (executionRecord?.exclusionMode || mode) === "full" ? "كامل المتبقي" : "جزء من المتبقي"],
                    ["نوع الاستبعاد", exclusionType || "—"],
                    ["السبب", reason || "—"],
                    ["تاريخ سريان الاستبعاد", effectiveDate],
                    ["الكمية المستبعدة", executionRecord ? String(executionRecord.quantityExcluded) : excludeQty],
                    ["الكمية المتبقية", String(executionRecord ? executionRecord.quantityRemaining : availableQuantity - Number(excludeQty || "0"))],
                    ["عدد المسؤولين", String(responsibles.length)],
                    ["عدد الصور", String(images.filter(i => i.url).length)],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{label}:</span>
                      <span className={`font-bold ${label === "الكمية المستبعدة" ? "text-destructive" : label === "الكمية المتبقية" ? "text-emerald-600" : ""}`}>
                        {label === "الكمية المستبعدة" ? `-${value}` : value}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="text-xs space-y-2 mb-4">{responsibles.map((r,i) => <p key={i}>{r.job}: {r.name}</p>)}<div className="flex flex-wrap gap-2">{images.filter(i=>i.url).map(i => <img key={i.id} src={i.url} alt={i.name} className="w-20 h-20 object-contain rounded border" />)}</div></div>
                {!executed && <p className="text-xs text-destructive border border-destructive/30 rounded p-3 mb-4">تنفيذ الاستبعاد عملية تاريخية لا يمكن حذفها أو تعديلها مباشرة بعد التنفيذ. راجع الكمية وتاريخ السريان والمسؤولين والمرفقات.</p>}
                {/* حالة + أزرار */}
                {executed ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-emerald-600">
                      <CheckCircle2 className="w-4 h-4" />
                      <span className="text-sm font-bold">تم تنفيذ الاستبعاد بنجاح</span>
                    </div>
                    <p className="text-xs text-primary font-bold">رقم العملية: {executionCode}</p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => {
                        if (!executionRecord) return;
                        printExclusionReport({ ...executionRecord, entityName: executionRecord.entityName || "—",
                          entityCode: executionRecord.entityCode || "—", responsibles: executionRecord.responsibleData,
                          images: executionRecord.exclusionImages, exclusionDate: executionRecord.exclusionDate });
                      }}>
                        <FileText className="w-3.5 h-3.5" /> إعادة فتح التقرير
                      </Button>
                    </div>
                  </div>
                ) : draftSaved ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-emerald-600">
                      <CheckCircle2 className="w-4 h-4" />
                      <span className="text-sm font-bold">المسودة جاهزة للتنفيذ</span>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="destructive" className="h-8 text-xs gap-1.5" disabled={busy}
                        onClick={() => setExecutionConfirmation(true)}>
                        {createExclusion.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                        تنفيذ الاستبعاد
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" disabled={busy} onClick={() => { setIsEditing(true); setDraftSaved(false); }}>
                        تعديل البيانات
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 text-xs gap-1.5 text-destructive"
                        onClick={() => { if (confirm("هل أنت متأكد من إلغاء المسودة؟\nسيتم مسح جميع البيانات المدخلة.")) cancelDraft(); }}>
                        إلغاء المسودة
                      </Button>
                    </div>
                  </div>
                ) : isEditing ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-amber-600">
                      <AlertTriangle className="w-4 h-4" />
                      <span className="text-sm font-bold">جاري التعديل - يمكنك تعديل جميع الحقول</span>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" className="h-8 text-xs gap-1.5" disabled={busy} onClick={saveDraft}>حفظ التعديلات</Button>
                      <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={generateSignatures}>إعادة توليد التواقيع</Button>
                      <Button size="sm" variant="ghost" className="h-8 text-xs gap-1.5 text-destructive" disabled={busy} onClick={() => { const saved = (draftsData || []).find(d => d.id === draftId); if (saved) restoreDraft(saved); }}>إلغاء التعديل</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button size="sm" className="h-8 text-xs gap-1.5" disabled={busy} onClick={saveDraft}>حفظ كمسودة</Button>
                    <Button size="sm" variant="ghost" className="h-8 text-xs gap-1.5 text-destructive" onClick={() => { if (confirm("هل أنت متأكد من الإلغاء؟")) cancelDraft(); }}>إلغاء</Button>
                  </div>
                )}
              </div>
              <div className="flex justify-end">
                <Button variant="outline" disabled={executed || busy} onClick={() => setActiveTab(3)} className="gap-1.5">
                  <ChevronRight className="w-3.5 h-3.5" /> السابق
                </Button>
              </div>
            </div>
          )}
        </>
      )}
      <WorkflowConfirmationDialog
        open={executionConfirmation}
        title="تأكيد تنفيذ الاستبعاد"
        description="سيتم تحديث الكمية وتسجيل الاستبعاد كعملية تاريخية مقفلة لا يمكن تعديلها أو حذفها مباشرة."
        recordName={`${(isAsset ? foundItem?.assetCode : foundItem?.code) ?? ""} · الكمية ${excludeQty} · السريان ${effectiveDate}`}
        confirmLabel="تأكيد الاستبعاد"
        pending={busy}
        onCancel={() => setExecutionConfirmation(false)}
        onConfirm={() => void executeExclusion()}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   مكون إدارة الاستبعادات (مربوط بالـ API)
   ═══════════════════════════════════════════════════════════════ */
function ExclusionManagement({ category }: { category: "asset" | "custody" }) {
  const isAsset = category === "asset";
  const itemLabel = isAsset ? "الأصل" : "العهدة";

  const { data: exclusionsData, isLoading, refetch } = trpc.operations.exclusions.list.useQuery();
  const records = (exclusionsData || []).filter((r: any) => r.entityType === category);

  // جلب بيانات الأصول والعهد لمعرفة اسم العنصر
  const { data: assetsData } = trpc.inventory.assets.list.useQuery({});
  const { data: custodyData } = trpc.inventory.custody.list.useQuery({});

  const [searchText, setSearchText] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const filteredRecords = records.filter((r: any) => {
    const matchSearch = !searchText ||
      (r.exclusionCode || "").toLowerCase().includes(searchText.toLowerCase()) ||
      (r.reason || "").toLowerCase().includes(searchText.toLowerCase()) ||
      (r.oldEmployeeName || "").toLowerCase().includes(searchText.toLowerCase()) ||
      (r.oldDepartmentName || "").toLowerCase().includes(searchText.toLowerCase());
    const matchType = typeFilter === "all" ||
      (typeFilter === "partial" && r.exclusionMode === "partial") ||
      (typeFilter === "full" && r.exclusionMode === "full");
    return matchSearch && matchType;
  });

  const selectedRecord = records.find((r: any) => r.id === selectedId);

  // الحصول على اسم العنصر من قوائم الأصول/العهد
  const getEntityName = (record: any) => {
    if (record.entityName) return record.entityName;
    if (record.entityType === "asset") {
      const found = (assetsData || []).find((item: any) => item.id === record.entityId);
      return found ? (found.assetName || "—") + " (حالي؛ غير محفوظ تاريخيًا)" : "غير محفوظ تاريخيًا";
    } else {
      const found = (custodyData || []).find((item: any) => item.id === record.entityId);
      return found ? (found.name || "—") + " (حالي؛ غير محفوظ تاريخيًا)" : "غير محفوظ تاريخيًا";
    }
  };

  const getEntityCode = (record: any) => {
    if (record.entityCode) return record.entityCode;
    if (record.entityType === "asset") {
      const found = (assetsData || []).find((item: any) => item.id === record.entityId);
      return found ? (found.assetCode || "—") + " (حالي)" : "غير محفوظ تاريخيًا";
    } else {
      const found = (custodyData || []).find((item: any) => item.id === record.entityId);
      return found ? (found.code || "—") + " (حالي)" : "غير محفوظ تاريخيًا";
    }
  };

  const handlePrintReport = (record: any) => {
    const responsibles = Array.isArray(record.responsibleData) ? record.responsibleData : [];
    // استخراج روابط الصور من exclusionImages (S3 URLs أو data URLs)
    const rawImages = Array.isArray(record.exclusionImages) ? record.exclusionImages : [];
    const images = rawImages.filter((url: unknown): url is string => typeof url === "string" && isDisplayImageUrl(url));
    printExclusionReport({
      exclusionCode: record.exclusionCode,
      exclusionMode: record.exclusionMode,
      entityType: record.entityType,
      entityName: getEntityName(record),
      entityCode: getEntityCode(record),
      reason: record.reason,
      originalQuantity: record.originalQuantity, previouslyExcluded: record.previouslyExcluded, effectiveDate: record.effectiveDate,
      previouslyReplaced: (record.entitySnapshot as any)?.warrantyReplacedQuantity,
      quantityBefore: record.quantityBefore || 0,
      quantityExcluded: record.quantityExcluded || 0,
      quantityRemaining: record.quantityRemaining || 0,
      oldEmployeeName: record.oldEmployeeName,
      oldDepartmentName: record.oldDepartmentName,
      oldLocationName: record.oldLocationName,
      responsibles,
      exclusionDate: record.exclusionDate || record.createdAt,
      images,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-center py-2">
        <h3 className="text-base font-bold text-primary">إدارة عمليات استبعاد {isAsset ? "الأصول" : "العهد"}</h3>
      </div>

      {/* البحث والفلاتر */}
      <div className="bg-muted/30 rounded-xl p-4 border border-border space-y-3">
        <p className="text-xs font-bold text-foreground">بحث وتصفية:</p>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">بحث عام:</label>
            <input type="text" value={searchText} onChange={(e) => setSearchText(e.target.value)}
              placeholder={`رقم الاستبعاد، السبب...`}
              className="h-8 w-56 px-3 rounded-lg bg-background border border-border text-xs focus:outline-none focus:ring-2 focus:ring-primary/20" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">نوع الاستبعاد:</label>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="partial">جزئي</SelectItem>
                <SelectItem value="full">كلي</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => { setSearchText(""); setTypeFilter("all"); }}>إعادة تعيين</Button>
        </div>
      </div>

      {/* الجدول */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="p-3 border-b border-border">
          <h4 className="text-xs font-bold text-foreground">قائمة استبعادات {isAsset ? "الأصول" : "العهد"} ({filteredRecords.length})</h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="px-3 py-2 text-right font-bold text-muted-foreground">ID</th>
                <th className="px-3 py-2 text-right font-bold text-muted-foreground">رقم الاستبعاد</th>
                <th className="px-3 py-2 text-center font-bold text-muted-foreground">الكمية المستبعدة</th>
                <th className="px-3 py-2 text-center font-bold text-muted-foreground">المتبقي</th>
                <th className="px-3 py-2 text-right font-bold text-muted-foreground">السبب</th>
                <th className="px-3 py-2 text-right font-bold text-muted-foreground">التاريخ</th>
                <th className="px-3 py-2 text-center font-bold text-muted-foreground">الوضع</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map((r: any) => (
                <tr key={r.id} onClick={() => setSelectedId(r.id)}
                  className={`border-b border-border/50 cursor-pointer transition-colors ${
                    selectedId === r.id ? "bg-primary/5" : "hover:bg-muted/30"
                  } ${r.exclusionMode === "full" ? "bg-red-50/30 dark:bg-red-950/10" : "bg-amber-50/30 dark:bg-amber-950/10"}`}>
                  <td className="px-3 py-2.5 text-right">{r.id}</td>
                  <td className="px-3 py-2.5 text-right font-mono font-bold text-primary">{r.exclusionCode}</td>
                  <td className="px-3 py-2.5 text-center font-bold">{r.quantityExcluded}</td>
                  <td className="px-3 py-2.5 text-center">{r.quantityRemaining}</td>
                  <td className="px-3 py-2.5 text-right truncate max-w-[200px]">{r.reason}</td>
                  <td className="px-3 py-2.5 text-right text-muted-foreground">{new Date(r.createdAt).toLocaleDateString("ar-SA")}</td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      r.exclusionMode === "full" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                    }`}>
                      {r.exclusionMode === "full" ? "كلي" : "جزئي"}
                    </span>
                  </td>
                </tr>
              ))}
              {filteredRecords.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">لا توجد سجلات</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* أزرار الإجراءات */}
      <div className="bg-muted/30 rounded-xl p-4 border border-border">
        <p className="text-xs font-bold text-muted-foreground mb-3">
          {selectedId ? `✓ تم تحديد السجل #${selectedId}` : "حدد سجلاً من الجدول لتفعيل الإجراءات"}
        </p>
        <div className="grid grid-cols-3 gap-3">
          <Button size="sm" className="h-10 text-xs gap-1.5 bg-blue-600 hover:bg-blue-700"
            disabled={!selectedId}
            onClick={() => { if (!selectedId) { toast.warning("يرجى تحديد سجل"); return; } setShowDetails(true); }}>
            <Eye className="w-3.5 h-3.5" /> عرض التفاصيل
          </Button>
          <Button size="sm" className="h-10 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700"
            disabled={!selectedId}
            onClick={() => {
              if (!selectedId) { toast.warning("يرجى تحديد سجل"); return; }
              const record = records.find((r: any) => r.id === selectedId);
              if (record) handlePrintReport(record);
            }}>
            <Printer className="w-3.5 h-3.5" /> طباعة التقرير
          </Button>
          <Button size="sm" className="h-10 text-xs gap-1.5 bg-amber-600 hover:bg-amber-700"
            onClick={() => { refetch(); toast.success("تم تحديث البيانات"); }}>
            <RefreshCw className="w-3.5 h-3.5" /> تحديث البيانات
          </Button>
        </div>
      </div>

      {/* نافذة التفاصيل */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">تفاصيل استبعاد {itemLabel}</DialogTitle>
          </DialogHeader>
          {selectedRecord && (
            <div className="space-y-4 max-h-[70vh] overflow-y-auto">
              <p className="text-xs text-muted-foreground">عملية منفذة محفوظة تاريخيًا؛ لا يمكن تعديلها أو حذفها.</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  ["رقم الاستبعاد", (selectedRecord as any).exclusionCode],
                  ["نوع الاستبعاد", (selectedRecord as any).exclusionMode === "full" ? "كلي" : "جزئي"],
                  ["اسم العنصر", getEntityName(selectedRecord)],
                  ["رمز العنصر", getEntityCode(selectedRecord)],
                  ["الكمية الأصلية", String((selectedRecord as any).originalQuantity ?? "غير محفوظة")],
                  ["قيمة الوحدة وقت الاستبعاد", selectedRecord.originalUnitValue ?? "غير محفوظة تاريخياً"],
                  ["نوع الاستبعاد", (selectedRecord.entitySnapshot as any)?.exclusionTypeName || "غير محفوظ تاريخياً"],
                  ["المستبعد سابقًا", String((selectedRecord as any).previouslyExcluded ?? "غير محفوظ")],
                  ["المستبدل بالضمان سابقًا", String((selectedRecord as any).entitySnapshot?.warrantyReplacedQuantity ?? "غير محفوظ")],
                  ["المتبقي قبل العملية", String((selectedRecord as any).quantityBefore || 0)],
                  ["تاريخ السريان", (selectedRecord as any).effectiveDate || "غير محفوظ"],
                  ["تاريخ تسجيل العملية", new Date((selectedRecord as any).createdAt).toLocaleString("ar-SA")],
                  ["الكمية المستبعدة", String((selectedRecord as any).quantityExcluded || 0)],
                  ["الكمية المتبقية", String((selectedRecord as any).quantityRemaining || 0)],
                  ["الموظف", (selectedRecord as any).oldEmployeeName || "—"],
                  ["القسم", (selectedRecord as any).oldDepartmentName || "—"],
                  ["الموقع", (selectedRecord as any).oldLocationName || "—"],

                ].map(([label, value]) => (
                  <div key={label} className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-bold text-muted-foreground">{label}</span>
                    <span className="text-sm text-foreground font-medium">{value}</span>
                  </div>
                ))}
              </div>
              <div className="bg-muted/30 rounded-lg p-3">
                <p className="text-[10px] font-bold text-muted-foreground mb-1">سبب الاستبعاد:</p>
                <p className="text-sm text-foreground">{(selectedRecord as any).reason}</p>
              </div>
              {Array.isArray((selectedRecord as any).responsibleData) && (selectedRecord as any).responsibleData.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground mb-2">المسؤولون:</p>
                  <div className="grid grid-cols-2 gap-2">
                    {((selectedRecord as any).responsibleData as any[]).map((r: any, i: number) => (
                      <div key={i} className="bg-primary/5 rounded-lg p-2 border border-primary/10">
                        <p className="text-[10px] text-muted-foreground">{r.job}</p>
                        <p className="text-xs font-bold text-foreground">{r.name}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {Array.isArray(selectedRecord.exclusionImages) && selectedRecord.exclusionImages.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {(selectedRecord.exclusionImages as string[]).map((url, index) => (
                    <img key={index} src={url} alt={"مرفق الاستبعاد " + (index + 1)} className="rounded border object-contain max-h-40 w-full" />
                  ))}
                </div>
              )}
              <ExclusionHistory id={selectedRecord.id} />
              <div className="flex gap-2 pt-2">
                <Button size="sm" className="gap-1.5 text-xs" onClick={() => { handlePrintReport(selectedRecord); setShowDetails(false); }}>
                  <Printer className="w-3.5 h-3.5" /> طباعة التقرير
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => setShowDetails(false)}>
                  إغلاق
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   الصفحة الرئيسية - تبويبات علوية (أصول / عهد)
   ═══════════════════════════════════════════════════════════════ */
export default function Exclusions() {
  const [topTab, setTopTab] = useState<"asset" | "custody">("asset");
  const [assetSubTab, setAssetSubTab] = useState(0);
  const [custodySubTab, setCustodySubTab] = useState(0);

  const subTabs = [
    { label: "استبعاد", color: "text-primary" },
    { label: "إدارة الاستبعادات", color: "text-primary" },
  ];

  const activeSubTab = topTab === "asset" ? assetSubTab : custodySubTab;
  const setActiveSubTab = topTab === "asset" ? setAssetSubTab : setCustodySubTab;

  return (
    <DashboardLayout
      title="إدارة الاستبعادات"
      subtitle="استبعاد الكمية المطلوبة من الأصول والعهد مع حفظ تاريخ العمليات"
    >
      {/* التبويبات العلوية: أصول / عهد */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTopTab("asset")}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
            topTab === "asset"
              ? "bg-primary text-primary-foreground shadow-md"
              : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <Box className="w-4 h-4" />
          استبعادات الأصول
        </button>
        <button
          onClick={() => setTopTab("custody")}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
            topTab === "custody"
              ? "bg-primary text-primary-foreground shadow-md"
              : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <Package className="w-4 h-4" />
          استبعادات العهد
        </button>
      </div>

      {/* التبويبات الفرعية: تنفيذ الاستبعاد / إدارة الاستبعادات */}
      <div className="flex border-b border-border mb-6">
        {subTabs.map((tab, idx) => (
          <button
            key={idx}
            onClick={() => setActiveSubTab(idx)}
            className={`px-6 py-3 text-sm font-bold border-b-2 transition-all ${
              activeSubTab === idx
                ? `border-primary ${tab.color} bg-primary/5`
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* محتوى التبويب */}
      {activeSubTab === 0 && <ExclusionWizard key={topTab} category={topTab} />}
      {activeSubTab === 1 && <ExclusionManagement key={topTab} category={topTab} />}
    </DashboardLayout>
  );
}
