import FieldHelp from "@/components/FieldHelp";
import { escapeHtml } from "@shared/html";
import { remainingQuantity } from "@shared/inventoryQuantity";
/**
 * Design: Calm Luxury - عمليات النقل
 * مربوطة بالـ API الحقيقي عبر tRPC
 * - النقل الجزئي فقط (النقل الكلي مخفي من الواجهة)
 * - إجراءات: استعراض وطباعة؛ الحركات المنفذة لا تعدل
 */
import DashboardLayout from "@/components/DashboardLayout";
import WorkflowConfirmationDialog from "@/components/WorkflowConfirmationDialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeftRight, ArrowRight, Box, Building2, Eye, Filter, HandCoins,
  Loader2, MapPin, Plus, Printer, Search, User
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

// ─── دالة مساعدة لطباعة ورقة النقل ─────────────────────────────────────────
function printTransferSheet(t: any) {
  const entityLabel = t.entityType === "asset" ? "أصل" : "عهدة";
  const typeLabel = t.movementType === "total" ? "نقل كلي" : "نقل جزئي";
  const date = new Date(t.createdAt).toLocaleDateString("ar-SA", {
    year: "numeric", month: "long", day: "numeric",
  });
  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8"/>
<title>ورقة عملية نقل #${escapeHtml(t.id)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Cairo', sans-serif; background: #fff; color: #1a1a1a; padding: 32px; }
  .header { text-align: center; border-bottom: 2px solid #0d9488; padding-bottom: 16px; margin-bottom: 24px; }
  .header h1 { font-size: 22px; font-weight: 700; color: #0d9488; }
  .header p { font-size: 12px; color: #666; margin-top: 4px; }
  .badge { display: inline-block; padding: 3px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; background: #e0f2f1; color: #0d9488; }
  .section { margin-bottom: 20px; }
  .section-title { font-size: 13px; font-weight: 700; color: #374151; border-right: 3px solid #0d9488; padding-right: 8px; margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { background: #f0fdfa; color: #0d9488; font-weight: 700; padding: 8px 12px; text-align: right; border: 1px solid #d1fae5; }
  td { padding: 8px 12px; border: 1px solid #e5e7eb; }
  .arrow-row { display: flex; align-items: center; gap: 12px; padding: 12px; background: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb; }
  .emp-box { flex: 1; text-align: center; }
  .emp-label { font-size: 10px; color: #6b7280; }
  .emp-name { font-size: 13px; font-weight: 700; color: #1a1a1a; margin-top: 2px; }
  .arrow { color: #0d9488; font-size: 20px; }
  .signatures { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-top: 40px; }
  .sig-box { border-top: 1px solid #374151; padding-top: 8px; text-align: center; font-size: 11px; color: #374151; }
  @media print { body { padding: 20px; } }
</style>
</head>
<body>
<div class="header">
  <h1>ورقة عملية نقل</h1>
  <p>رقم العملية: #${escapeHtml(t.id)} &nbsp;|&nbsp; التاريخ: ${escapeHtml(date)}</p>
  <div style="margin-top:8px"><span class="badge">${escapeHtml(typeLabel)}</span></div>
</div>

<div class="section">
  <div class="section-title">بيانات العنصر</div>
  <table>
    <tr><th>النوع</th><td>${escapeHtml(entityLabel)}</td><th>الرمز</th><td>${escapeHtml(t.entityCode || "-")}</td></tr>
    <tr><th>الاسم</th><td colspan="3">${escapeHtml(t.entityName || `${entityLabel} #${t.entityId}`)}</td></tr>
    ${t.historicalSnapshot === false ? '<tr><td colspan="4">حركة قديمة: أسماء الموظفين والعنصر مستخرجة من البيانات الحالية؛ لم تحفظ تاريخيًا.</td></tr>' : ""}
    <tr><th>الكمية المنقولة</th><td>${escapeHtml(t.quantity)}</td><th>القيمة</th><td>${escapeHtml(t.assetValue || "-")}</td></tr>
  </table>
</div>

<div class="section">
  <div class="section-title">مسار النقل</div>
  <div class="arrow-row">
    <div class="emp-box">
      <div class="emp-label">من الموظف</div>
      <div class="emp-name">${escapeHtml(t.fromEmployeeName || (t.fromEmployeeId ? `موظف #${t.fromEmployeeId}` : "غير محدد"))}</div>
    </div>
    <div class="arrow">←</div>
    <div class="emp-box">
      <div class="emp-label">إلى الموظف</div>
      <div class="emp-name">${escapeHtml(t.toEmployeeName || `موظف #${t.toEmployeeId}`)}</div>
    </div>
  </div>
</div>

${t.notes ? `<div class="section"><div class="section-title">ملاحظات</div><p style="font-size:13px;padding:10px;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb">${escapeHtml(t.notes)}</p></div>` : ""}

<div class="signatures">
  <div class="sig-box">المحوِّل<br/><br/><br/>التوقيع: ___________</div>
  <div class="sig-box">المستلم<br/><br/><br/>التوقيع: ___________</div>
  <div class="sig-box">المشرف المسؤول<br/><br/><br/>التوقيع: ___________</div>
</div>
</body>
</html>`;

  const win = window.open("", "_blank", "width=800,height=600");
  if (!win) { toast.error("يرجى السماح بفتح النوافذ المنبثقة"); return; }
  win.document.write(html);
  win.document.close();
  win.onload = () => { win.focus(); win.print(); };
}

// ─── المكوّن الرئيسي ──────────────────────────────────────────────────────────
export default function Transfers() {
  const { data: transfersData, isLoading } = trpc.operations.transfers.list.useQuery();
  const { data: assetsData } = trpc.inventory.assets.list.useQuery({});
  const { data: custodyData } = trpc.inventory.custody.list.useQuery({});
  const { data: employeesData } = trpc.settings.employees.list.useQuery();
  const { data: departmentsData } = trpc.settings.departments.list.useQuery();
  const { data: locationsData } = trpc.settings.locations.list.useQuery();
  const { data: branchesData } = trpc.settings.branches.list.useQuery();

  const utils = trpc.useUtils();
  const createTransfer = trpc.operations.transfers.create.useMutation({
    onSuccess: () => {
      utils.operations.transfers.list.invalidate();
      utils.inventory.assets.list.invalidate();
      utils.inventory.custody.list.invalidate();
    },
  });

  const transfers = transfersData || [];
  const allAssets = assetsData || [];
  const allCustody = custodyData || [];
  const employees = employeesData || [];
  const departments = departmentsData || [];
  const locations_ = locationsData || [];
  const branches = branchesData || [];

  // ─── state لعملية النقل الجديدة ─────────────────────────────────────────────
  const [showNew, setShowNew] = useState(false);
  const [transferSearch, setTransferSearch] = useState("");
  const [transferItemId, setTransferItemId] = useState("");
  const [toEmployeeId, setToEmployeeId] = useState("");
  const [toLocationId, setToLocationId] = useState("");
  const [toBranchId, setToBranchId] = useState("");
  const [toDepartmentId, setToDepartmentId] = useState("");

  // ─── state للاستعراض ──────────────────────────────────────────────────────
  const [viewRecord, setViewRecord] = useState<any>(null);
  const [showView, setShowView] = useState(false);

  // ─── state للطباعة (جلب بيانات كاملة) ────────────────────────────────────
  const [printingId, setPrintingId] = useState<number | null>(null);

  // ─── بيانات getById للطباعة ───────────────────────────────────────────────
  const { data: printData } = trpc.operations.transfers.getById.useQuery(
    { id: printingId! },
    { enabled: printingId !== null }
  );
  useEffect(() => {
    if (printData && printingId !== null) {
      printTransferSheet(printData);
      setPrintingId(null);
    }
  }, [printData]);

  // ─── عناصر قابلة للنقل والبحث بالاسم أو الرمز ───────────────────────────────
  const transferableItems = useMemo(() => {
    const assetItems = allAssets.filter((a: any) => a.status === "ACTIVE" && remainingQuantity(a) > 0).map((a: any) => ({
      id: a.id, type: "asset" as const, code: a.assetCode || "", name: a.assetName || "",
      quantity: remainingQuantity(a), assignedTo: a.assignedTo, employeeName: a.employeeName || "غير محدد",
      departmentId: a.departmentId, departmentName: a.departmentName || "غير محدد",
      locationId: a.locationId, locationName: a.locationName || "غير محدد", branchId: (a as any).branchId, branchName: (a as any).branchName || "غير محدد",
    }));
    const custodyItems = allCustody.filter((c: any) => c.status === "ACTIVE" && remainingQuantity(c) > 0).map((c: any) => ({
      id: c.id, type: "custody" as const, code: c.code || "", name: c.name || "",
      quantity: remainingQuantity(c), assignedTo: c.assignedTo, employeeName: c.employeeName || "غير محدد",
      departmentId: c.departmentId, departmentName: c.departmentName || "غير محدد",
      locationId: c.locationId, locationName: c.locationName || "غير محدد", branchId: (c as any).branchId, branchName: (c as any).branchName || "غير محدد",
    }));
    return [...assetItems, ...custodyItems];
  }, [allAssets, allCustody]);

  const filteredTransferItems = useMemo(() => {
    const q = transferSearch.trim().toLowerCase();
    if (!q) return transferableItems;
    return transferableItems.filter((item) =>
      item.name.toLowerCase().includes(q) || item.code.toLowerCase().includes(q)
    );
  }, [transferableItems, transferSearch]);

  const selectedTransferItem = useMemo(() => {
    if (!transferItemId) return null;
    const [type, id] = transferItemId.split("-");
    return transferableItems.find((item) => item.type === type && item.id === Number(id)) || null;
  }, [transferItemId, transferableItems]);

  const destinationBranches = useMemo(() => branches.filter((b:any)=>toLocationId && String(b.locationId)===toLocationId),[branches,toLocationId]);
  const destinationDepartments = useMemo(() => departments.filter((d:any)=>toBranchId && String(d.branchId)===toBranchId),[departments,toBranchId]);

  const handleSelectTransferItem = (value: string) => {
    setTransferItemId(value);
    const [type, id] = value.split("-");
    const item = transferableItems.find((x) => x.type === type && x.id === Number(id));
    setToEmployeeId("");
    setToLocationId(item?.locationId ? String(item.locationId) : "");
    setToBranchId((item as any)?.branchId ? String((item as any).branchId) : "");
    setToDepartmentId(item?.departmentId ? String(item.departmentId) : "");
  };

  const handleLocationChange = (value: string) => {
    setToLocationId(value);
    setToBranchId("");
    setToDepartmentId("");
  };

  const resetTransferForm = () => {
    setTransferSearch(""); setTransferItemId(""); setToEmployeeId("");
    setToLocationId(""); setToBranchId(""); setToDepartmentId("");
  };

  // ─── تنفيذ النقل ───────────────────────────────────────────────────────────
  const [transferConfirmation, setTransferConfirmation] = useState(false);
  const transferExecuting = useRef(false);
  const handleTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTransferItem || !toEmployeeId || !toLocationId || !toBranchId || !toDepartmentId) {
      toast.error("يرجى اختيار الأصل/العهدة والموظف والموقع والفرع والقسم الجديد"); return;
    }
    if (createTransfer.isPending) return;
    if (selectedTransferItem.assignedTo === Number(toEmployeeId) && selectedTransferItem.departmentId === Number(toDepartmentId) && selectedTransferItem.locationId === Number(toLocationId)) {
      toast.error("اختر وجهة مختلفة عن التخصيص الحالي"); return;
    }
    setTransferConfirmation(true);
  };
  const executeTransfer = async () => {
    if (!selectedTransferItem || createTransfer.isPending || transferExecuting.current) return;
    transferExecuting.current = true;
    try {
      const result = await createTransfer.mutateAsync({
        entityType: selectedTransferItem.type,
        entityId: selectedTransferItem.id,
        movementType: "partial",
        fromEmployeeId: selectedTransferItem.assignedTo || null,
        toEmployeeId: Number(toEmployeeId),
        toLocationId: Number(toLocationId),
        toDepartmentId: Number(toDepartmentId),
        notes: null,
      });
      toast.success(`تم النقل بنجاح — رقم الحركة: ${result.id} — الكمية المنقولة: ${result.quantityMoved}`);
      setShowNew(false);
      resetTransferForm();
    } catch (error: any) {
      toast.error(error.message || "حدث خطأ أثناء النقل");
    } finally {
      transferExecuting.current = false;
      setTransferConfirmation(false);
    }
  };

  // ─── فتح نافذة الاستعراض ──────────────────────────────────────────────────
  const handleView = (t: any) => { setViewRecord(t); setShowView(true); };

  // ─── طباعة ورقة النقل ─────────────────────────────────────────────────────
  const handlePrint = (t: any) => { setPrintingId(t.id); };

  // ─── مساعدات عرض ──────────────────────────────────────────────────────────
  const getEmployeeName = (id: number | null) => {
    if (!id) return "غير محدد";
    const emp = employees.find((e: any) => e.id === id);
    return emp ? (emp as any).fullName : `موظف #${id}`;
  };

  if (isLoading) {
    return (
      <DashboardLayout title="عمليات النقل" subtitle="جاري التحميل...">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title="عمليات النقل"
      subtitle="نقل الأصول والعهد بين الموظفين"
      actions={
        <div className="flex items-center gap-2 w-full justify-end">
          <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => setShowNew(true)}>
            <Plus className="w-3.5 h-3.5" />
            عملية نقل جديدة
          </Button>
        </div>
      }
    >
      {/* ─── سجل عمليات النقل ─────────────────────────────────────────────── */}
      <div className="bg-card rounded-xl border border-border shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.03)]">
        <div className="p-4 border-b border-border">
          <h3 className="text-sm font-bold text-foreground">سجل عمليات النقل</h3>
          <p className="text-[11px] text-muted-foreground">عمليات نقل منفذة وتاريخية؛ متاحة للعرض والطباعة ولا يمكن تعديلها مباشرة.</p>
        </div>
        <div className="divide-y divide-border/50">
          {transfers.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              لا توجد عمليات نقل مسجلة بعد
            </div>
          ) : (
            transfers.map((t: any) => (
              <div key={t.id} className="flex items-center gap-4 p-4 hover:bg-muted/30 transition-colors">
                {/* أيقونة النوع */}
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${t.entityType === "asset" ? "bg-teal-50" : "bg-amber-50"}`}>
                  {t.entityType === "asset"
                    ? <Box className="w-4.5 h-4.5 text-teal-600" />
                    : <HandCoins className="w-4.5 h-4.5 text-amber-600" />}
                </div>

                {/* بيانات العملية */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {t.entityName || (t.entityType === "asset" ? "أصل" : "عهدة")} {t.entityCode || `#${t.entityId}`}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex items-center gap-1.5">
                      <User className="w-3 h-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">{t.fromEmployeeName ?? getEmployeeName(t.fromEmployeeId)}</span>
                    </div>
                    <ArrowRight className="w-3 h-3 text-primary" />
                    <div className="flex items-center gap-1.5">
                      <User className="w-3 h-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">{t.toEmployeeName ?? getEmployeeName(t.toEmployeeId)}</span>
                    </div>
                  </div>
                </div>

                {/* الحالة والتاريخ */}
                <div className="text-left shrink-0">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${t.movementType === "total" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
                    نقل {t.movementType === "total" ? "كلي" : "جزئي"}
                  </span>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    الكمية: {t.quantity} | {new Date(t.createdAt).toLocaleDateString("ar-SA")}
                  </p>
                </div>

                {/* ─── أزرار الإجراءات ─────────────────────────────────────── */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleView(t)}
                    title="استعراض التفاصيل"
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handlePrint(t)}
                    title="طباعة ورقة البيانات"
                    disabled={printingId === t.id}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-teal-600 hover:bg-teal-50 transition-colors disabled:opacity-50"
                  >
                    {printingId === t.id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Printer className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ─── نافذة عملية نقل جديدة ─────────────────────────────────────────── */}
      <Dialog open={showNew} onOpenChange={(open) => { setShowNew(open); if (!open) resetTransferForm(); }}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <ArrowLeftRight className="w-5 h-5 text-primary" />
              عملية نقل جديدة
            </DialogTitle>
          </DialogHeader>

          <form className="space-y-4 mt-2" onSubmit={handleTransfer}>
            <div className="space-y-2">
              <label className="text-xs font-bold text-foreground">البحث عن الأصل أو العهدة</label>
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                <FieldHelp text={"ابحث بجزء من اسم الأصل أو العهدة أو رمزها لاختيار السجل النشط المطلوب نقله."}><input
                  value={transferSearch}
                  onChange={(e) => setTransferSearch(e.target.value)}
                  placeholder="ابحث باسم الأصل/العهدة أو الرمز..."
                  className="w-full h-10 pr-10 pl-3 rounded-lg bg-white border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                /></FieldHelp>
              </div>
              <Select value={transferItemId} onValueChange={handleSelectTransferItem}>
                <FieldHelp text={"اختر الأصل أو العهدة المراد نقلها؛ تظهر السجلات النشطة التي لديها كمية متبقية فقط."}><SelectTrigger className="h-10 text-sm"><SelectValue placeholder="اختر من نتائج البحث" /></SelectTrigger></FieldHelp>
                <SelectContent>
                  {filteredTransferItems.length === 0 ? (
                    <div className="py-4 text-center text-xs text-muted-foreground">لا توجد نتائج مطابقة</div>
                  ) : filteredTransferItems.map((item) => (
                    <SelectItem key={`${item.type}-${item.id}`} value={`${item.type}-${item.id}`}>
                      {item.type === "asset" ? "أصل" : "عهدة"} — {item.code || "بدون رمز"} — {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedTransferItem && (
              <div className="rounded-xl border border-border bg-muted/20 p-4">
                <p className="text-xs font-bold text-foreground mb-3">البيانات الحالية</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                  <div><span className="text-muted-foreground">الاسم</span><p className="font-semibold mt-1">{selectedTransferItem.name}</p></div>
                  <div><span className="text-muted-foreground">الرمز</span><p className="font-semibold mt-1">{selectedTransferItem.code || "—"}</p></div>
                  <div><span className="text-muted-foreground">الموظف الحالي</span><p className="font-semibold mt-1">{selectedTransferItem.employeeName}</p></div>
                  <div><span className="text-muted-foreground">الموقع الحالي</span><p className="font-semibold mt-1">{selectedTransferItem.locationName}</p></div>
                  <div><span className="text-muted-foreground">القسم الحالي</span><p className="font-semibold mt-1">{selectedTransferItem.departmentName}</p></div>
                  <div><span className="text-muted-foreground">الكمية المتبقية القابلة للنقل</span><p className="font-semibold mt-1">{selectedTransferItem.quantity}</p></div>
                </div>
              </div>
            )}

            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
              <p className="text-xs font-bold text-foreground">بيانات النقل الجديدة</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold">الموظف الجديد</label>
                  <Select value={toEmployeeId} onValueChange={setToEmployeeId} disabled={!selectedTransferItem}>
                    <FieldHelp text={"الموظف الذي ستصبح الوحدات في عهدته بعد تنفيذ النقل."}><SelectTrigger className="h-10 bg-white"><SelectValue placeholder="اختر الموظف" /></SelectTrigger></FieldHelp>
                    <SelectContent>{employees.map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.fullName}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold">الموقع الجديد</label>
                  <Select value={toLocationId} onValueChange={handleLocationChange} disabled={!selectedTransferItem}>
                    <FieldHelp text={"الموقع الذي ستنقل إليه الوحدات؛ يحدد الفروع المتاحة للوجهة."}><SelectTrigger className="h-10 bg-white"><SelectValue placeholder="اختر الموقع" /></SelectTrigger></FieldHelp>
                    <SelectContent>{locations_.map((l: any) => <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold">الفرع الجديد</label>
                  <Select value={toBranchId} onValueChange={(v)=>{setToBranchId(v);setToDepartmentId("")}} disabled={!toLocationId}>
                    <FieldHelp text={"الفرع المستلم ضمن الموقع المختار؛ يحدد الأقسام المتاحة للوجهة."}><SelectTrigger className="h-10 bg-white"><SelectValue placeholder="اختر الفرع" /></SelectTrigger></FieldHelp>
                    <SelectContent>{destinationBranches.map((b:any)=><SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold">القسم الجديد</label>
                  <Select value={toDepartmentId} onValueChange={setToDepartmentId} disabled={!toBranchId}>
                    <FieldHelp text={"القسم المستلم ضمن الفرع المختار؛ يحفظ ضمن التخصيص الجديد بعد التنفيذ."}><SelectTrigger className="h-10 bg-white"><SelectValue placeholder="اختر القسم" /></SelectTrigger></FieldHelp>
                    <SelectContent>{destinationDepartments.map((d: any) => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">الموظف الجديد مستقل عن قسمه الوظيفي؛ الموقع والفرع والقسم هنا تخص الأصل أو العهدة المنقولة.</p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowNew(false)}>إلغاء</Button>
              <Button type="submit" disabled={createTransfer.isPending || !selectedTransferItem}>
                {createTransfer.isPending ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : null}
                تنفيذ النقل
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── نافذة الاستعراض ──────────────────────────────────────────────── */}
      <Dialog open={showView} onOpenChange={setShowView}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Eye className="w-4 h-4 text-primary" />
              تفاصيل عملية النقل #{viewRecord?.id}
            </DialogTitle>
          </DialogHeader>
          {viewRecord && (
            <div className="space-y-4 mt-2">
              <p className="text-xs text-muted-foreground">حركة منفذة لا يمكن تعديلها مباشرة. {!viewRecord.historicalSnapshot && "هذه حركة قديمة؛ أسماء الموظفين المعروضة مستخرجة من البيانات الحالية."}</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-muted/30 rounded-lg p-3">
                  <p className="text-[10px] text-muted-foreground mb-1">هوية السجل وقت النقل</p>
                  <p className="text-sm font-bold">{viewRecord.entityName || "غير محفوظ تاريخيًا"} — {viewRecord.entityCode || `#${viewRecord.entityId}`}</p>
                </div>
                <div className="bg-muted/30 rounded-lg p-3">
                  <p className="text-[10px] text-muted-foreground mb-1">نوع العنصر</p>
                  <p className="text-sm font-bold">{viewRecord.entityType === "asset" ? "أصل" : "عهدة"}</p>
                </div>
                <div className="bg-muted/30 rounded-lg p-3">
                  <p className="text-[10px] text-muted-foreground mb-1">نوع النقل</p>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${viewRecord.movementType === "total" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
                    نقل {viewRecord.movementType === "total" ? "كلي" : "جزئي"}
                  </span>
                </div>
                <div className="bg-muted/30 rounded-lg p-3">
                  <p className="text-[10px] text-muted-foreground mb-1">من الموظف</p>
                  <p className="text-sm font-bold">{viewRecord.fromEmployeeName ?? getEmployeeName(viewRecord.fromEmployeeId)}</p>
                </div>
                <div className="bg-muted/30 rounded-lg p-3">
                  <p className="text-[10px] text-muted-foreground mb-1">إلى الموظف</p>
                  <p className="text-sm font-bold">{viewRecord.toEmployeeName ?? getEmployeeName(viewRecord.toEmployeeId)}</p>
                </div>
                <div className="bg-muted/30 rounded-lg p-3">
                  <p className="text-[10px] text-muted-foreground mb-1">الكمية</p>
                  <p className="text-sm font-bold">{viewRecord.quantity}</p>
                </div>
                <div className="bg-muted/30 rounded-lg p-3">
                  <p className="text-[10px] text-muted-foreground mb-1">التاريخ</p>
                  <p className="text-sm font-bold">{new Date(viewRecord.createdAt).toLocaleDateString("ar-SA")}</p>
                </div>
              </div>
              {viewRecord.notes && (
                <div className="bg-muted/30 rounded-lg p-3">
                  <p className="text-[10px] text-muted-foreground mb-1">ملاحظات</p>
                  <p className="text-sm">{viewRecord.notes}</p>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => { setShowView(false); handlePrint(viewRecord); }}>
                  <Printer className="w-3.5 h-3.5 ml-1" /> طباعة
                </Button>
                <Button size="sm" onClick={() => setShowView(false)}>إغلاق</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <WorkflowConfirmationDialog
        open={transferConfirmation}
        title="تأكيد تنفيذ النقل"
        description="سيحفظ النقل حركة تاريخية لا يمكن تعديلها أو حذفها مباشرة."
        recordName={`${selectedTransferItem?.code ?? ""} · ${selectedTransferItem?.name ?? ""} · إلى ${getEmployeeName(Number(toEmployeeId))}`}
        confirmLabel="تأكيد النقل"
        pending={createTransfer.isPending}
        onCancel={() => setTransferConfirmation(false)}
        onConfirm={() => void executeTransfer()}
      />
    </DashboardLayout>
  );
}
