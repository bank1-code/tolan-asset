/**
 * Design: Calm Luxury - عمليات النقل
 * مربوطة بالـ API الحقيقي عبر tRPC
 * - النقل الجزئي فقط (النقل الكلي مخفي من الواجهة)
 * - إجراءات: استعراض، تعديل، طباعة
 */
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeftRight, ArrowRight, Box, Building2, Eye, Filter, HandCoins,
  Loader2, MapPin, Pencil, Plus, Printer, Search, User
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
<title>ورقة عملية نقل #${t.id}</title>
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
  <p>رقم العملية: #${t.id} &nbsp;|&nbsp; التاريخ: ${date}</p>
  <div style="margin-top:8px"><span class="badge">${typeLabel}</span></div>
</div>

<div class="section">
  <div class="section-title">بيانات العنصر</div>
  <table>
    <tr><th>النوع</th><td>${entityLabel}</td><th>الرمز</th><td>${t.entityCode || "-"}</td></tr>
    <tr><th>الاسم</th><td colspan="3">${t.entityName || `${entityLabel} #${t.entityId}`}</td></tr>
    <tr><th>الكمية المنقولة</th><td>${t.quantity}</td><th>القيمة</th><td>${t.assetValue || "-"}</td></tr>
  </table>
</div>

<div class="section">
  <div class="section-title">مسار النقل</div>
  <div class="arrow-row">
    <div class="emp-box">
      <div class="emp-label">من الموظف</div>
      <div class="emp-name">${t.fromEmployeeName || (t.fromEmployeeId ? `موظف #${t.fromEmployeeId}` : "غير محدد")}</div>
    </div>
    <div class="arrow">←</div>
    <div class="emp-box">
      <div class="emp-label">إلى الموظف</div>
      <div class="emp-name">${t.toEmployeeName || `موظف #${t.toEmployeeId}`}</div>
    </div>
  </div>
</div>

${t.notes ? `<div class="section"><div class="section-title">ملاحظات</div><p style="font-size:13px;padding:10px;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb">${t.notes}</p></div>` : ""}

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

  const utils = trpc.useUtils();
  const createTransfer = trpc.operations.transfers.create.useMutation({
    onSuccess: () => {
      utils.operations.transfers.list.invalidate();
      utils.inventory.assets.list.invalidate();
      utils.inventory.custody.list.invalidate();
    },
  });
  const updateTransfer = trpc.operations.transfers.update.useMutation({
    onSuccess: () => { utils.operations.transfers.list.invalidate(); },
  });

  const transfers = transfersData || [];
  const allAssets = assetsData || [];
  const allCustody = custodyData || [];
  const employees = employeesData || [];
  const departments = departmentsData || [];
  const locations_ = locationsData || [];

  // ─── state للنموذج الجديد ──────────────────────────────────────────────────
  const [showNew, setShowNew] = useState(false);
  const [partialSearch, setPartialSearch] = useState("");
  const [partialDeptFilter, setPartialDeptFilter] = useState("all");
  const [partialLocFilter, setPartialLocFilter] = useState("all");
  const [partialItemId, setPartialItemId] = useState("");
  const [partialQty, setPartialQty] = useState("1");
  const [partialFromEmp, setPartialFromEmp] = useState("");
  const [partialToEmp, setPartialToEmp] = useState("");

  // ─── state للاستعراض ──────────────────────────────────────────────────────
  const [viewRecord, setViewRecord] = useState<any>(null);
  const [showView, setShowView] = useState(false);

  // ─── state للتعديل ────────────────────────────────────────────────────────
  const [editRecord, setEditRecord] = useState<any>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [editFromEmp, setEditFromEmp] = useState("none");
  const [editToEmp, setEditToEmp] = useState("");
  const [editNotes, setEditNotes] = useState("");

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

  // ─── عناصر النقل الجزئي ───────────────────────────────────────────────────
  const allPartialItems = useMemo(() => {
    const assetItems = allAssets.filter((a: any) => a.quantity > 1 && a.status === "ACTIVE").map((a: any) => ({
      id: a.id, type: "asset" as const,
      code: a.code || "", name: a.name || "",
      quantity: a.quantity,
      departmentName: a.departmentName || "", locationName: a.locationName || "",
      departmentId: a.departmentId, locationId: a.locationId,
      label: `${a.code || ""} - ${a.name} (الكمية: ${a.quantity})`,
    }));
    const custItems = allCustody.filter((c: any) => c.quantity > 1 && c.status === "ACTIVE").map((c: any) => ({
      id: c.id, type: "custody" as const,
      code: c.code || "", name: c.name || "",
      quantity: c.quantity,
      departmentName: c.departmentName || "", locationName: c.locationName || "",
      departmentId: c.departmentId, locationId: c.locationId,
      label: `${c.code || ""} - ${c.name} (الكمية: ${c.quantity})`,
    }));
    return [...assetItems, ...custItems];
  }, [allAssets, allCustody]);

  const filteredPartialItems = useMemo(() => {
    return allPartialItems.filter(item => {
      if (partialSearch.trim()) {
        const q = partialSearch.toLowerCase();
        if (!(item.name || "").toLowerCase().includes(q) && !(item.code || "").toLowerCase().includes(q)) return false;
      }
      if (partialDeptFilter !== "all" && String(item.departmentId) !== partialDeptFilter) return false;
      if (partialLocFilter !== "all" && String(item.locationId) !== partialLocFilter) return false;
      return true;
    });
  }, [allPartialItems, partialSearch, partialDeptFilter, partialLocFilter]);

  const resetPartialFilters = () => { setPartialSearch(""); setPartialDeptFilter("all"); setPartialLocFilter("all"); };
  const hasActivePartialFilters = partialSearch.trim() !== "" || partialDeptFilter !== "all" || partialLocFilter !== "all";

  // ─── تنفيذ النقل الجزئي ───────────────────────────────────────────────────
  const handlePartialTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partialItemId || !partialToEmp) { toast.error("يرجى تعبئة جميع الحقول المطلوبة"); return; }
    const [type, id] = partialItemId.split("-");
    try {
      await createTransfer.mutateAsync({
        entityType: type as "asset" | "custody",
        entityId: Number(id),
        movementType: "partial",
        fromEmployeeId: partialFromEmp ? Number(partialFromEmp) : null,
        toEmployeeId: Number(partialToEmp),
        quantity: Number(partialQty) || 1,
        notes: null,
      });
      toast.success("تم النقل الجزئي بنجاح");
      setShowNew(false);
      resetPartialFilters();
      setPartialItemId(""); setPartialQty("1"); setPartialFromEmp(""); setPartialToEmp("");
    } catch (error: any) {
      toast.error(error.message || "حدث خطأ أثناء النقل");
    }
  };

  // ─── فتح نافذة الاستعراض ──────────────────────────────────────────────────
  const handleView = (t: any) => { setViewRecord(t); setShowView(true); };

  // ─── فتح نافذة التعديل ────────────────────────────────────────────────────
  const handleEdit = (t: any) => {
    setEditRecord(t);
    setEditFromEmp(t.fromEmployeeId ? String(t.fromEmployeeId) : "none");
    setEditToEmp(String(t.toEmployeeId));
    setEditNotes(t.notes || "");
    setShowEdit(true);
  };

  // ─── حفظ التعديل ──────────────────────────────────────────────────────────
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editToEmp) { toast.error("يرجى تحديد الموظف المستلم"); return; }
    try {
      await updateTransfer.mutateAsync({
        id: editRecord.id,
        fromEmployeeId: (editFromEmp && editFromEmp !== "none") ? Number(editFromEmp) : null,
        toEmployeeId: Number(editToEmp),
        notes: editNotes || null,
      });
      toast.success("تم تحديث بيانات عملية النقل");
      setShowEdit(false);
    } catch (error: any) {
      toast.error(error.message || "حدث خطأ أثناء الحفظ");
    }
  };

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
          <p className="text-[11px] text-muted-foreground">جميع عمليات النقل المسجلة في النظام</p>
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
                    {t.entityType === "asset" ? "أصل" : "عهدة"} #{t.entityId}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex items-center gap-1.5">
                      <User className="w-3 h-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">{getEmployeeName(t.fromEmployeeId)}</span>
                    </div>
                    <ArrowRight className="w-3 h-3 text-primary" />
                    <div className="flex items-center gap-1.5">
                      <User className="w-3 h-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">{getEmployeeName(t.toEmployeeId)}</span>
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
                    onClick={() => handleEdit(t)}
                    title="تعديل البيانات"
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-amber-600 hover:bg-amber-50 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
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

      {/* ─── نافذة عملية نقل جديدة (جزئي فقط) ─────────────────────────────── */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <ArrowLeftRight className="w-5 h-5 text-primary" />
              عملية نقل جديدة
            </DialogTitle>
          </DialogHeader>

          <div className="mt-2">
            <p className="text-xs mb-4 bg-purple-50 text-purple-700 p-3 rounded-lg">
              النقل الجزئي: يتم نقل جزء من الكمية مع إنشاء سجل جديد برمز مختلف للكمية المنقولة.
            </p>
            <form className="space-y-4" onSubmit={handlePartialTransfer}>
              {/* البحث والفلاتر */}
              <div className="bg-muted/20 border border-border/60 rounded-xl p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Filter className="w-3.5 h-3.5 text-primary" />
                    <span className="text-xs font-bold text-foreground">بحث وتصفية</span>
                  </div>
                  {hasActivePartialFilters && (
                    <button type="button" onClick={resetPartialFilters} className="text-[10px] text-red-500 hover:text-red-700 underline">
                      تصفير الفلاتر
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                  <input
                    value={partialSearch}
                    onChange={(e) => setPartialSearch(e.target.value)}
                    placeholder="ابحث بالاسم أو الرمز..."
                    className="w-full h-9 pr-10 pl-3 rounded-lg bg-white border border-border text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-muted-foreground flex items-center gap-1">
                      <Building2 className="w-3 h-3" /> القسم
                    </label>
                    <Select value={partialDeptFilter} onValueChange={setPartialDeptFilter}>
                      <SelectTrigger className="h-9 text-xs bg-white"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">الكل</SelectItem>
                        {departments.map((d: any) => (
                          <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-muted-foreground flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> الموقع
                    </label>
                    <Select value={partialLocFilter} onValueChange={setPartialLocFilter}>
                      <SelectTrigger className="h-9 text-xs bg-white"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">الكل</SelectItem>
                        {locations_.map((l: any) => (
                          <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">
                  العنصر <span className="text-muted-foreground font-normal">({filteredPartialItems.length} عنصر{hasActivePartialFilters ? " مطابق" : ""})</span>
                </label>
                <Select value={partialItemId} onValueChange={setPartialItemId}>
                  <SelectTrigger className="h-10 text-sm"><SelectValue placeholder="اختر الأصل أو العهدة" /></SelectTrigger>
                  <SelectContent>
                    {filteredPartialItems.length === 0 ? (
                      <div className="py-4 text-center text-xs text-muted-foreground">لا توجد نتائج مطابقة</div>
                    ) : (
                      filteredPartialItems.map((item) => (
                        <SelectItem key={`${item.type}-${item.id}`} value={`${item.type}-${item.id}`}>
                          <span className="flex items-center gap-2">
                            <span className={`inline-block w-1.5 h-1.5 rounded-full ${item.type === "asset" ? "bg-teal-500" : "bg-amber-500"}`} />
                            {item.label}
                          </span>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">الكمية المراد نقلها</label>
                <input
                  type="number" min="1" value={partialQty}
                  onChange={(e) => setPartialQty(e.target.value)}
                  placeholder="أدخل الكمية"
                  className="w-full h-10 px-3 rounded-lg bg-muted/40 border border-border text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground">من (الموظف الحالي)</label>
                  <Select value={partialFromEmp} onValueChange={setPartialFromEmp}>
                    <SelectTrigger className="h-10 text-sm"><SelectValue placeholder="الموظف الحالي" /></SelectTrigger>
                    <SelectContent>
                      {employees.map((e: any) => (
                        <SelectItem key={e.id} value={String(e.id)}>{e.fullName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground">إلى (الموظف الجديد) <span className="text-red-500">*</span></label>
                  <Select value={partialToEmp} onValueChange={setPartialToEmp}>
                    <SelectTrigger className="h-10 text-sm"><SelectValue placeholder="اختر الموظف" /></SelectTrigger>
                    <SelectContent>
                      {employees.map((e: any) => (
                        <SelectItem key={e.id} value={String(e.id)}>{e.fullName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowNew(false)}>إلغاء</Button>
                <Button type="submit" disabled={createTransfer.isPending}>
                  {createTransfer.isPending ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : null}
                  تنفيذ النقل الجزئي
                </Button>
              </div>
            </form>
          </div>
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
              <div className="grid grid-cols-2 gap-3">
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
                  <p className="text-sm font-bold">{getEmployeeName(viewRecord.fromEmployeeId)}</p>
                </div>
                <div className="bg-muted/30 rounded-lg p-3">
                  <p className="text-[10px] text-muted-foreground mb-1">إلى الموظف</p>
                  <p className="text-sm font-bold">{getEmployeeName(viewRecord.toEmployeeId)}</p>
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
                <Button variant="outline" size="sm" onClick={() => { setShowView(false); handleEdit(viewRecord); }}>
                  <Pencil className="w-3.5 h-3.5 ml-1" /> تعديل
                </Button>
                <Button size="sm" onClick={() => setShowView(false)}>إغلاق</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── نافذة التعديل ────────────────────────────────────────────────── */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Pencil className="w-4 h-4 text-amber-600" />
              تعديل عملية النقل #{editRecord?.id}
            </DialogTitle>
          </DialogHeader>
          {editRecord && (
            <form className="space-y-4 mt-2" onSubmit={handleSaveEdit}>
              <div className="bg-muted/20 rounded-lg p-3 text-xs text-muted-foreground">
                <strong>العنصر:</strong> {editRecord.entityType === "asset" ? "أصل" : "عهدة"} #{editRecord.entityId} &nbsp;|&nbsp;
                <strong>نوع النقل:</strong> {editRecord.movementType === "total" ? "نقل كلي" : "نقل جزئي"}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground">من (الموظف الحالي)</label>
                  <Select value={editFromEmp} onValueChange={setEditFromEmp}>
                    <SelectTrigger className="h-10 text-sm"><SelectValue placeholder="الموظف الحالي" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">غير محدد</SelectItem>
                      {employees.map((e: any) => (
                        <SelectItem key={e.id} value={String(e.id)}>{e.fullName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground">إلى (الموظف الجديد) <span className="text-red-500">*</span></label>
                  <Select value={editToEmp} onValueChange={setEditToEmp}>
                    <SelectTrigger className="h-10 text-sm"><SelectValue placeholder="اختر الموظف" /></SelectTrigger>
                    <SelectContent>
                      {employees.map((e: any) => (
                        <SelectItem key={e.id} value={String(e.id)}>{e.fullName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">ملاحظات</label>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="سبب النقل أو أي ملاحظات..."
                  className="w-full h-16 px-3 py-2 rounded-lg bg-muted/40 border border-border text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all resize-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowEdit(false)}>إلغاء</Button>
                <Button type="submit" disabled={updateTransfer.isPending}>
                  {updateTransfer.isPending ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : null}
                  حفظ التعديلات
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
