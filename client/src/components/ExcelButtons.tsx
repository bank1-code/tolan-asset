/*
 * مكون أزرار تصدير واستيراد Excel
 * قابل لإعادة الاستخدام في جميع الشاشات
 */
import { Button } from "@/components/ui/button";
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
  a.click();
  URL.revokeObjectURL(url);
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

// ==========================================
// أزرار تصدير/استيراد الأصول
// ==========================================
export function AssetsExcelButtons() {
  const exportMut = trpc.excel.exportAssets.useMutation({
    onSuccess: (data) => {
      downloadBase64File(data.base64, data.filename);
      toast.success(`تم تصدير ${data.count} أصل بنجاح`);
    },
    onError: (e) => toast.error(e.message),
  });

  const importMut = trpc.excel.importAssets.useMutation({
    onSuccess: (data) => {
      toast.success(`تم استيراد ${data.imported} أصل بنجاح`);
      if (data.errors.length > 0) {
        toast.warning(`${data.errors.length} أخطاء أثناء الاستيراد`);
      }
      // Invalidate assets query
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
        onClick={() => templateMut.mutate({ type: "assets" })}
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

// ==========================================
// أزرار تصدير/استيراد العهد
// ==========================================
export function CustodyExcelButtons() {
  const exportMut = trpc.excel.exportCustody.useMutation({
    onSuccess: (data) => {
      downloadBase64File(data.base64, data.filename);
      toast.success(`تم تصدير ${data.count} عهدة بنجاح`);
    },
    onError: (e) => toast.error(e.message),
  });

  const importMut = trpc.excel.importCustody.useMutation({
    onSuccess: (data) => {
      toast.success(`تم استيراد ${data.imported} عهدة بنجاح`);
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
        onClick={() => templateMut.mutate({ type: "custody" })}
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
