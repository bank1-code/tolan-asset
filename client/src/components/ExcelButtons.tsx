/*
 * مكون أزرار تصدير واستيراد Excel
 * قابل لإعادة الاستخدام في جميع الشاشات
 */
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { trpc } from "@/lib/trpc";
import { Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

// Helper: تحويل base64 إلى ملف وتنزيله
function downloadBase64File(base64: string, filename: string) {
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteNumbers[i] = byteChars.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Keep the Blob alive until the browser has started consuming the download.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// Helper: قراءة ملف كـ base64
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data URL prefix
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

type ImportPreview = { base64Data: string; total: number; accepted: number; rejected: number; errors: string[] };

function ImportPreviewDialog({ title, preview, pending, onCancel, onConfirm }: { title: string; preview: ImportPreview | null; pending: boolean; onCancel: () => void; onConfirm: () => void }) {
  return <Dialog open={!!preview} onOpenChange={(open) => !open && !pending && onCancel()}>
    <DialogContent dir="rtl" className="sm:max-w-lg">
      <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>تم فحص الملف فقط ولم يتم حفظ أي بيانات بعد.</DialogDescription></DialogHeader>
      {preview && <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-md border p-3"><div className="text-xs text-muted-foreground">الإجمالي</div><div className="text-xl font-bold">{preview.total}</div></div>
          <div className="rounded-md border p-3"><div className="text-xs text-muted-foreground">المقبول</div><div className="text-xl font-bold">{preview.accepted}</div></div>
          <div className="rounded-md border p-3"><div className="text-xs text-muted-foreground">المرفوض</div><div className="text-xl font-bold">{preview.rejected}</div></div>
        </div>
        {preview.errors.length > 0 && <div><div className="text-sm font-medium mb-2">أسباب الرفض</div><ScrollArea className="h-36 rounded-md border p-3"><div className="space-y-1 text-sm">{preview.errors.map((error, i) => <div key={i}>{error}</div>)}</div></ScrollArea></div>}
        <p className="text-sm font-medium">هل تريد متابعة استيراد {preview.accepted} سجل مقبول؟</p>
      </div>}
      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={pending}>إلغاء</Button>
        <Button onClick={onConfirm} disabled={pending || !preview || preview.accepted === 0}>{pending && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}متابعة الاستيراد</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

// ==========================================
// أزرار تصدير/استيراد الأصول
// ==========================================
export function AssetsExcelButtons() {
  const [preview, setPreview] = useState<{ base64Data: string; total: number; accepted: number; rejected: number; errors: string[] } | null>(null);
  const exportMut = trpc.excel.exportAssets.useMutation({
    onSuccess: (data) => { downloadBase64File(data.base64, data.filename); toast.success(`تم تصدير ${data.count} أصل بنجاح`); },
    onError: (e) => toast.error(e.message),
  });
  const importMut = trpc.excel.importAssets.useMutation({
    onSuccess: (data) => {
      toast.success(`تم حفظ ${data.imported} أصل كمسودات بانتظار الاعتماد`);
      if (data.errors.length > 0) toast.warning(`تم رفض ${data.errors.length} صف`);
      setPreview(null);
      window.location.reload();
    },
    onError: (e) => toast.error(e.message),
  });
  const previewMut = trpc.excel.importAssets.useMutation({
    onSuccess: (data, variables) => setPreview({ base64Data: variables.base64Data, total: data.total, accepted: data.imported, rejected: data.skipped, errors: data.errors }),
    onError: (e) => toast.error(e.message),
  });
  const templateMut = trpc.excel.downloadTemplate.useMutation({
    onSuccess: (data) => { downloadBase64File(data.base64, data.filename); toast.success("تم تحميل القالب بنجاح"); },
    onError: (e) => toast.error(e.message),
  });
  const handleImport = async () => {
    const input = document.createElement("input"); input.type = "file"; input.accept = ".xlsx,.xls";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]; if (!file) return;
      try { const base64 = await readFileAsBase64(file); previewMut.mutate({ base64Data: base64, previewOnly: true }); }
      catch { toast.error("فشل قراءة الملف"); }
    };
    input.click();
  };
  return (<>
    <div className="flex items-center gap-1.5">
      <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => templateMut.mutate({ type: "assets" })} disabled={templateMut.isPending}>{templateMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}قالب</Button>
      <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={handleImport} disabled={previewMut.isPending || importMut.isPending}>{previewMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}استيراد</Button>
      <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => exportMut.mutate()} disabled={exportMut.isPending}>{exportMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}تصدير</Button>
    </div>
    <ImportPreviewDialog title="نتيجة فحص ملف الأصول" preview={preview} pending={importMut.isPending} onCancel={() => setPreview(null)} onConfirm={() => preview && importMut.mutate({ base64Data: preview.base64Data, previewOnly: false })} />
  </>);
}

// ==========================================
// أزرار تصدير/استيراد العهد
// ==========================================
export function CustodyExcelButtons() {
  const [preview, setPreview] = useState<{ base64Data: string; total: number; accepted: number; rejected: number; errors: string[] } | null>(null);
  const exportMut = trpc.excel.exportCustody.useMutation({ onSuccess: (data) => { downloadBase64File(data.base64, data.filename); toast.success(`تم تصدير ${data.count} عهدة بنجاح`); }, onError: (e) => toast.error(e.message) });
  const importMut = trpc.excel.importCustody.useMutation({ onSuccess: (data) => { toast.success(`تم حفظ ${data.imported} عهدة كمسودات بانتظار الاعتماد`); if (data.errors.length > 0) toast.warning(`تم رفض ${data.errors.length} صف`); setPreview(null); window.location.reload(); }, onError: (e) => toast.error(e.message) });
  const previewMut = trpc.excel.importCustody.useMutation({ onSuccess: (data, variables) => setPreview({ base64Data: variables.base64Data, total: data.total, accepted: data.imported, rejected: data.skipped, errors: data.errors }), onError: (e) => toast.error(e.message) });
  const templateMut = trpc.excel.downloadTemplate.useMutation({ onSuccess: (data) => { downloadBase64File(data.base64, data.filename); toast.success("تم تحميل القالب بنجاح"); }, onError: (e) => toast.error(e.message) });
  const handleImport = async () => {
    const input = document.createElement("input"); input.type = "file"; input.accept = ".xlsx,.xls";
    input.onchange = async (e) => { const file = (e.target as HTMLInputElement).files?.[0]; if (!file) return; try { const base64 = await readFileAsBase64(file); previewMut.mutate({ base64Data: base64, previewOnly: true }); } catch { toast.error("فشل قراءة الملف"); } };
    input.click();
  };
  return (<>
    <div className="flex items-center gap-1.5">
      <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => templateMut.mutate({ type: "custody" })} disabled={templateMut.isPending}>{templateMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}قالب</Button>
      <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={handleImport} disabled={previewMut.isPending || importMut.isPending}>{previewMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}استيراد</Button>
      <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => exportMut.mutate()} disabled={exportMut.isPending}>{exportMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}تصدير</Button>
    </div>
    <ImportPreviewDialog title="نتيجة فحص ملف العهد" preview={preview} pending={importMut.isPending} onCancel={() => setPreview(null)} onConfirm={() => preview && importMut.mutate({ base64Data: preview.base64Data, previewOnly: false })} />
  </>);
}

// ==========================================
// زر تصدير التقارير
// ==========================================
export function ReportsExcelButton() {
  const exportMut = trpc.excel.exportReport.useMutation({
    onSuccess: (data) => {
      downloadBase64File(data.base64, data.filename);
      toast.success(`تم تصدير التقرير بنجاح (${data.count} سجل)`);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Button
      size="sm"
      variant="outline"
      className="h-8 text-xs gap-1.5"
      onClick={() => exportMut.mutate({ reportType: "all" })}
      disabled={exportMut.isPending}
    >
      {exportMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
      تصدير Excel
    </Button>
  );
}

// ==========================================
// زر تصدير سجل التدقيق
// ==========================================
export function AuditLogExcelButton() {
  const exportMut = trpc.excel.exportAuditLog.useMutation({
    onSuccess: (data) => {
      downloadBase64File(data.base64, data.filename);
      toast.success(`تم تصدير ${data.count} سجل بنجاح`);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Button
      size="sm"
      variant="outline"
      className="h-8 text-xs gap-1.5"
      onClick={() => exportMut.mutate({})}
      disabled={exportMut.isPending}
    >
      {exportMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
      تصدير Excel
    </Button>
  );
}

// ==========================================
// أزرار تصدير/استيراد الموظفين
// ==========================================
type HierarchyImportResult = { imported: number; existing: number; rejected: number; total: number; previewOnly: boolean; results: Array<{ rowNumber: number; name: string; status: string; message: string }> };

export function HierarchyExcelButtons({ type }: { type: "locations" | "branches" | "departments" }) {
  const utils = trpc.useUtils();
  const [review, setReview] = useState<{ base64Data: string; result: HierarchyImportResult } | null>(null);
  const label = { locations: "المواقع", branches: "الفروع", departments: "الأقسام" }[type];
  const template = trpc.excel.hierarchyTemplate.useMutation({ onSuccess: data => downloadBase64File(data.base64, data.filename), onError: error => toast.error(error.message) });
  const exported = trpc.excel.exportHierarchy.useMutation({ onSuccess: data => { downloadBase64File(data.base64, data.filename); toast.success(`تم تصدير ${data.count} سجل`); }, onError: error => toast.error(error.message) });
  const preview = trpc.excel.importHierarchy.useMutation({ onSuccess: (result, variables) => setReview({ base64Data: variables.base64Data, result }), onError: error => toast.error(error.message) });
  const imported = trpc.excel.importHierarchy.useMutation({ onSuccess: (result, variables) => { setReview({ base64Data: variables.base64Data, result }); void utils.settings.invalidate(); toast.success(`تمت إضافة ${result.imported} سجل`); }, onError: error => toast.error(error.message) });
  const busy = template.isPending || exported.isPending || preview.isPending || imported.isPending;
  const chooseFile = () => {
    const input = document.createElement("input"); input.type = "file"; input.accept = ".xlsx,.xls";
    input.onchange = async () => {
      const file = input.files?.[0]; if (!file) return;
      if (file.size > 10 * 1024 * 1024) { toast.error("الحد الأقصى لحجم الملف 10 ميجابايت"); return; }
      try { preview.mutate({ type, base64Data: await readFileAsBase64(file), previewOnly: true }); }
      catch { toast.error("فشل قراءة الملف"); }
    };
    input.click();
  };
  return <>
    <div className="flex items-center gap-1.5">
      <Button size="sm" variant="outline" disabled={busy} onClick={() => template.mutate({ type })}><FileSpreadsheet className="w-3.5 h-3.5 ml-1" />قالب</Button>
      <Button size="sm" variant="outline" disabled={busy} onClick={chooseFile}>{preview.isPending ? <Loader2 className="w-3.5 h-3.5 ml-1 animate-spin" /> : <Upload className="w-3.5 h-3.5 ml-1" />}استيراد</Button>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => exported.mutate({ type })}><Download className="w-3.5 h-3.5 ml-1" />تصدير</Button>
    </div>
    <Dialog open={!!review} onOpenChange={open => { if (!open && !imported.isPending) setReview(null); }}>
      <DialogContent dir="rtl" className="sm:max-w-xl">
        <DialogHeader><DialogTitle>{review?.result.previewOnly ? "معاينة استيراد" : "نتيجة استيراد"} {label}</DialogTitle><DialogDescription>{review?.result.previewOnly ? "لم تُحفظ البيانات بعد. يُضاف الجديد فقط، وتُتجاهل السجلات الموجودة. الأكواد تُولد تلقائيًا عند الحفظ." : "اكتمل الاستيراد. التفاصيل التالية تعرض نتيجة كل صف."}</DialogDescription></DialogHeader>
        {review && <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded border p-3">{review.result.previewOnly ? "جاهز للإضافة" : "تمت إضافته"}<div className="text-xl font-bold">{review.result.imported}</div></div>
            <div className="rounded border p-3">موجود / مكرر<div className="text-xl font-bold">{review.result.existing}</div></div>
            <div className="rounded border p-3">مرفوض<div className="text-xl font-bold">{review.result.rejected}</div></div>
          </div>
          <ScrollArea className="h-64 rounded border p-3"><div className="space-y-3 text-sm">{review.result.results.map(row => <div key={row.rowNumber} className={row.status === "error" ? "text-destructive" : ""}><div className="font-medium">الصف {row.rowNumber}: {row.name || "بدون اسم"}</div><div>{row.message}</div></div>)}</div></ScrollArea>
          {review.result.previewOnly && <p className="text-xs text-muted-foreground">سيعاد التحقق عند التنفيذ. استورد المواقع أولًا، ثم الفروع، ثم الأقسام. يمكن تنفيذ الصفوف المقبولة بعد مراجعة المرفوضة.</p>}
        </div>}
        <DialogFooter><Button variant="outline" disabled={imported.isPending} onClick={() => setReview(null)}>{review?.result.previewOnly ? "إلغاء" : "إغلاق"}</Button>
          {review?.result.previewOnly && <Button disabled={imported.isPending || review.result.imported === 0} onClick={() => imported.mutate({ type, base64Data: review.base64Data, previewOnly: false })}>{imported.isPending && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}تنفيذ الاستيراد</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}

export function EmployeesExcelButtons() {
  const exportMut = trpc.excel.exportEmployees.useMutation({
    onSuccess: (data) => {
      downloadBase64File(data.base64, data.filename);
      toast.success(`تم تصدير ${data.count} موظف بنجاح`);
    },
    onError: (e) => toast.error(e.message),
  });

  const importMut = trpc.excel.importEmployees.useMutation({
    onSuccess: (data) => {
      toast.success(`تم استيراد ${data.imported} موظف بنجاح`);
      if (data.errors.length > 0) {
        toast.warning(`${data.errors.length} أخطاء أثناء الاستيراد`);
      }
      window.location.reload();
    },
    onError: (e) => toast.error(e.message),
  });

  const templateMut = trpc.excel.downloadTemplate.useMutation({
    onSuccess: (data) => {
      downloadBase64File(data.base64, data.filename);
      toast.success("تم تحميل القالب بنجاح");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleImport = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".xlsx,.xls";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const base64 = await readFileAsBase64(file);
        importMut.mutate({ base64Data: base64 });
      } catch {
        toast.error("فشل قراءة الملف");
      }
    };
    input.click();
  };

  return (
    <div className="flex items-center gap-1.5">
      <Button
        size="sm"
        variant="outline"
        className="h-8 text-xs gap-1.5"
        onClick={() => templateMut.mutate({ type: "employees" })}
        disabled={templateMut.isPending}
      >
        {templateMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
        قالب
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-8 text-xs gap-1.5"
        onClick={handleImport}
        disabled={importMut.isPending}
      >
        {importMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
        استيراد
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-8 text-xs gap-1.5"
        onClick={() => exportMut.mutate()}
        disabled={exportMut.isPending}
      >
        {exportMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
        تصدير
      </Button>
    </div>
  );
}
