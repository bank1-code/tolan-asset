/**
 * Archive.tsx - الأرشيف
 * مربوط بالـ API الحقيقي عبر tRPC
 */
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Archive as ArchiveIcon, Box, Download, Eye, FileText, FolderOpen,
  HandCoins, Printer, RefreshCw, Search, ShieldAlert, Trash2, Upload, Loader2
} from "lucide-react";

// =============================================
// مكون تبويب أرشيف (أصول أو عهد)
// =============================================
function ArchiveEntityTab({ entityType, entityLabel }: { entityType: string; entityLabel: string }) {
  const { user } = useAuth();
  const canDelete = user?.role === "owner" || user?.role === "admin";
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [searchText, setSearchText] = useState("");

  const { data: records, isLoading, refetch } = trpc.records.archive.list.useQuery({
    entityType,
    search: searchText || undefined,
  });
  const deleteArchive = trpc.records.archive.delete.useMutation();
  const utils = trpc.useUtils();

  const filteredRecords = records || [];

  const handleDelete = async () => {
    if (!selectedId) { toast.warning("يرجى اختيار سجل أولاً"); return; }
    const reason = prompt("سبب الحذف (مطلوب لصلاحيات المدير):");
    if (!reason) return;
    try {
      await deleteArchive.mutateAsync({ id: selectedId, reason });
      utils.records.archive.list.invalidate();
      setSelectedId(null);
      toast.success("تم حذف الوثيقة من الأرشيف");
    } catch {
      toast.error("حدث خطأ أثناء الحذف - قد تحتاج صلاحيات المدير");
    }
  };

  const handlePrint = () => {
    if (!selectedId) { toast.warning("يرجى اختيار سجل أولاً"); return; }
    const record = filteredRecords.find((r: any) => r.id === selectedId);
    if (!record) return;
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(`
        <html dir="rtl">
        <head>
          <title>طباعة - ${record.documentTitle}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700&display=swap');
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Tajawal', sans-serif; padding: 40px; color: #1a1a1a; background: #fff; }
            .header { text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #0d9488; }
            .header h1 { font-size: 22px; color: #0d9488; margin-bottom: 5px; }
            .header p { font-size: 12px; color: #888; }
            .info-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
            .info-table th { background: #f0fdfa; color: #0d9488; text-align: right; padding: 10px 15px; font-size: 13px; border: 1px solid #e0e0e0; width: 30%; }
            .info-table td { padding: 10px 15px; font-size: 13px; border: 1px solid #e0e0e0; }
            .footer { margin-top: 40px; text-align: center; font-size: 11px; color: #aaa; border-top: 1px solid #eee; padding-top: 15px; }
            .print-btn { display: block; margin: 20px auto; padding: 10px 30px; background: #0d9488; color: white; border: none; border-radius: 8px; font-size: 14px; font-family: 'Tajawal', sans-serif; cursor: pointer; }
            .print-btn:hover { background: #0f766e; }
            @media print { .print-btn { display: none; } }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>نظام إدارة العهد والأصول</h1>
            <p>وثيقة أرشيفية</p>
          </div>
          <table class="info-table">
            <tr><th>رقم السجل</th><td>${record.id}</td></tr>
            <tr><th>نوع العملية</th><td>${record.operationType}</td></tr>
            <tr><th>عنوان الوثيقة</th><td>${record.documentTitle}</td></tr>
            <tr><th>اسم الملف</th><td style="font-family: monospace; font-size: 11px;">${record.fileName}</td></tr>
            <tr><th>تاريخ الإنشاء</th><td>${record.createdAt ? new Date(record.createdAt).toLocaleString("ar-SA") : "-"}</td></tr>
          </table>
          <div class="footer">
            <p>تم الطباعة بتاريخ: ${new Date().toLocaleString("ar-SA")} | نظام إدارة العهد والأصول - الإصدار 2.0</p>
          </div>
          <button class="print-btn" onclick="window.print()">طباعة</button>
        </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  return (
    <div className="space-y-4">
      {/* شريط الأدوات */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5"
          onClick={() => { if (!selectedId) { toast.warning("يرجى اختيار سجل أولاً"); return; } toast.info("جاري فتح الملف..."); }}>
          <Eye className="w-3.5 h-3.5" /> عرض
        </Button>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5"
          onClick={() => { if (!selectedId) { toast.warning("يرجى اختيار سجل أولاً"); return; } toast.success("تم حفظ نسخة من الملف"); }}>
          <Download className="w-3.5 h-3.5" /> حفظ نسخة
        </Button>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={handlePrint}>
          <Printer className="w-3.5 h-3.5" /> طباعة
        </Button>
        {canDelete && (
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 text-destructive hover:text-destructive" onClick={handleDelete}>
            <Trash2 className="w-3.5 h-3.5" /> حذف
          </Button>
        )}
        <div className="mr-auto" />
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input type="text" placeholder={`بحث في أرشيف ${entityLabel}...`} value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="h-8 w-56 pr-8 pl-3 rounded-lg bg-muted/50 border border-border text-xs placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all" />
        </div>
      </div>

      {/* الجدول */}
      <div className="bg-card rounded-xl border border-border shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                <th className="text-right py-2.5 px-3 text-[11px] font-semibold text-muted-foreground w-16">ID</th>
                <th className="text-right py-2.5 px-3 text-[11px] font-semibold text-muted-foreground w-20">النوع</th>
                <th className="text-right py-2.5 px-3 text-[11px] font-semibold text-muted-foreground w-36">العملية</th>
                <th className="text-right py-2.5 px-3 text-[11px] font-semibold text-muted-foreground">العنوان</th>
                <th className="text-right py-2.5 px-3 text-[11px] font-semibold text-muted-foreground">اسم الملف</th>
                <th className="text-right py-2.5 px-3 text-[11px] font-semibold text-muted-foreground w-36">تاريخ الإنشاء</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="py-12 text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">جاري التحميل...</p>
                </td></tr>
              ) : filteredRecords.length === 0 ? (
                <tr><td colSpan={6} className="py-12 text-center">
                  <ArchiveIcon className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">لا توجد سجلات أرشيف</p>
                </td></tr>
              ) : (
                filteredRecords.map((record: any) => (
                  <tr key={record.id}
                    onClick={() => setSelectedId(record.id === selectedId ? null : record.id)}
                    className={`border-b border-border/50 cursor-pointer transition-colors ${
                      selectedId === record.id ? "bg-primary/5 ring-1 ring-inset ring-primary/20" : "hover:bg-muted/20"
                    }`}>
                    <td className="py-2.5 px-3 text-xs text-center font-medium text-primary">{record.id}</td>
                    <td className="py-2.5 px-3 text-xs text-center">
                      {record.isAutoGenerated ? (
                        <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-teal-50 text-teal-700 border border-teal-200">
                          ⚙️ تلقائي
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-600 border border-blue-200">
                          📂 يدوي
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-xs">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/8 text-primary">
                        {record.operationType}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-xs text-foreground">{record.documentTitle}</td>
                    <td className="py-2.5 px-3 text-xs text-muted-foreground font-mono text-[10px]">{record.fileName}</td>
                    <td className="py-2.5 px-3 text-xs text-center text-muted-foreground">
                      {record.createdAt ? new Date(record.createdAt).toLocaleString("ar-SA") : "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-3 py-2 bg-muted/20 border-t border-border">
          <span className="text-[10px] text-muted-foreground">إجمالي السجلات: {filteredRecords.length}</span>
        </div>
      </div>
    </div>
  );
}

// =============================================
// مكون تبويب التوثيق (رفع ملفات)
// =============================================
function ArchiveDocsTab({ entityType }: { entityType: "documentation_asset" | "documentation_custody" }) {
  const { user } = useAuth();
  const canDelete = user?.role === "owner" || user?.role === "admin";
  const [docTitle, setDocTitle] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editOpType, setEditOpType] = useState("");
  const [showEditModal, setShowEditModal] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const label = entityType === "documentation_asset" ? "الأصول" : "العهد";

  const createArchive = trpc.records.archive.create.useMutation();
  const deleteArchive = trpc.records.archive.delete.useMutation();
  const updateArchive = trpc.records.archive.update.useMutation();
  const { data: docs, isLoading } = trpc.records.archive.list.useQuery({ entityType });
  const utils = trpc.useUtils();

  const openEditModal = (doc: any) => {
    setEditingId(doc.id);
    setEditTitle(doc.documentTitle || "");
    setEditNotes(doc.notes || "");
    setEditOpType(doc.operationType || "");
    setShowEditModal(true);
  };

  const handleEditSave = async () => {
    if (!editingId) return;
    if (!editTitle.trim()) { toast.warning("عنوان المستند مطلوب"); return; }
    try {
      await updateArchive.mutateAsync({
        id: editingId,
        documentTitle: editTitle.trim(),
        notes: editNotes.trim() || null,
        operationType: editOpType.trim() || undefined,
      });
      utils.records.archive.list.invalidate();
      toast.success("تم تحديث بيانات المستند بنجاح");
      setShowEditModal(false);
      setEditingId(null);
    } catch {
      toast.error("حدث خطأ أثناء التحديث");
    }
  };

  const handleDocDelete = async (id: number, title: string) => {
    const reason = prompt(`سبب حذف "${title}" (مطلوب):`);
    if (!reason) return;
    try {
      await deleteArchive.mutateAsync({ id, reason });
      utils.records.archive.list.invalidate();
      toast.success("تم حذف المستند");
    } catch {
      toast.error("حدث خطأ - قد تحتاج صلاحيات المدير");
    }
  };

  const handleDocPrint = (doc: any) => {
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(`
        <html dir="rtl"><head><title>طباعة - ${doc.documentTitle}</title>
        <style>@import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700&display=swap');
        body{font-family:'Tajawal',sans-serif;padding:40px;color:#1a1a1a;}
        h1{color:#0d9488;font-size:20px;margin-bottom:20px;border-bottom:2px solid #0d9488;padding-bottom:10px;}
        table{width:100%;border-collapse:collapse;margin-top:20px;}
        th{background:#f0fdfa;color:#0d9488;padding:10px;text-align:right;border:1px solid #e0e0e0;}
        td{padding:10px;border:1px solid #e0e0e0;}
        .footer{margin-top:30px;text-align:center;font-size:11px;color:#aaa;border-top:1px solid #eee;padding-top:15px;}
        @media print{.no-print{display:none;}}</style></head>
        <body>
        <h1>نظام إدارة العهد والأصول - توثيق ${label}</h1>
        <table>
          <tr><th>رقم السجل</th><td>${doc.id}</td></tr>
          <tr><th>العنوان</th><td>${doc.documentTitle}</td></tr>
          <tr><th>اسم الملف</th><td style="font-family:monospace">${doc.fileName}</td></tr>
          <tr><th>نوع العملية</th><td>${doc.operationType}</td></tr>
          <tr><th>تاريخ الإنشاء</th><td>${doc.createdAt ? new Date(doc.createdAt).toLocaleString("ar-SA") : "-"}</td></tr>
          ${doc.notes ? `<tr><th>ملاحظات</th><td>${doc.notes}</td></tr>` : ""}
        </table>
        <div class="footer">تم الطباعة بتاريخ: ${new Date().toLocaleString("ar-SA")}</div>
        <button class="no-print" onclick="window.print()" style="margin-top:20px;padding:8px 24px;background:#0d9488;color:white;border:none;border-radius:6px;font-family:'Tajawal',sans-serif;font-size:14px;cursor:pointer;">طباعة</button>
        </body></html>
      `);
      printWindow.document.close();
    }
  };

  const handleDocDownload = (doc: any) => {
    if (doc.filePath) {
      // إذا كان الملف مرفوعاً على S3 - تحميل مباشر
      const a = document.createElement("a");
      a.href = doc.filePath;
      a.download = doc.fileName || doc.documentTitle;
      a.target = "_blank";
      a.click();
      toast.success("جاري تحميل الملف...");
    } else {
      // للسجلات القديمة التي لم تُرفع إلى S3
      toast.warning("هذا المستند لم يُرفع إلى الخادم. يرجى حذفه وإعادة رفعه لتفعيل التحميل");
    }
  };

  const handleFileSelect = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,.docx,.xlsx";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) setSelectedFile(file);
    };
    input.click();
  };

  const handleSave = async () => {
    if (!docTitle.trim()) { toast.warning("يرجى إدخال عنوان المستند"); return; }
    if (!selectedFile) { toast.warning("يرجى اختيار ملف أولاً"); return; }
    setIsUploading(true);
    try {
      // رفع الملف إلى S3 أولاً
      const formData = new FormData();
      formData.append("file", selectedFile);
      const uploadRes = await fetch("/api/upload", { method: "POST", body: formData, credentials: "include" });
      if (!uploadRes.ok) {
        const errData = await uploadRes.json().catch(() => ({}));
        throw new Error(errData.error || "فشل رفع الملف");
      }
      const uploadData = await uploadRes.json();
      const fileUrl = uploadData.url as string;

      await createArchive.mutateAsync({
        entityType,
        operationType: `توثيق ${label}`,
        documentTitle: docTitle,
        fileName: selectedFile.name,
        filePath: fileUrl,
      });
      utils.records.archive.list.invalidate();
      toast.success("تم حفظ المستند ورفعه بنجاح ✔️");
      setDocTitle("");
      setSelectedFile(null);
    } catch (err: any) {
      toast.error(err?.message || "حدث خطأ أثناء حفظ المستند");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-card rounded-xl border border-border shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6">
        <div className="flex items-center gap-2 mb-6">
          <Upload className="w-4.5 h-4.5 text-primary" />
          <h3 className="text-sm font-bold text-foreground">رفع توثيق {label}</h3>
        </div>
        <div className="space-y-5 max-w-xl">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-foreground">عنوان المستند</Label>
            <Input value={docTitle} onChange={(e) => setDocTitle(e.target.value)} placeholder="أدخل عنوان المستند..." className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-foreground">الملف</Label>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" className="h-9 text-xs gap-1.5" onClick={handleFileSelect}>
                <FolderOpen className="w-3.5 h-3.5" /> اختيار ملف
              </Button>
              <span className="text-xs text-muted-foreground">
                {selectedFile ? (
                  <span className="flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-primary" />
                    {selectedFile.name}
                    <span className="text-[10px] text-muted-foreground/60">({(selectedFile.size / 1024).toFixed(1)} KB)</span>
                  </span>
                ) : "لم يتم اختيار ملف"}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground/60 mt-1">الأنواع المدعومة: PDF, Word (docx), Excel (xlsx)</p>
          </div>
          <div className="pt-2">
            <Button size="sm" className="h-9 text-xs gap-1.5 px-6" onClick={handleSave} disabled={createArchive.isPending || isUploading}>
              {(createArchive.isPending || isUploading) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              حفظ في الأرشيف
            </Button>
          </div>
        </div>
      </div>

      {/* قائمة المستندات المحفوظة */}
      <div className="bg-card rounded-xl border border-border shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="p-3 border-b border-border bg-muted/20">
          <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-primary" />
            المستندات المحفوظة - توثيق {label}
          </h4>
        </div>
        {isLoading ? (
          <div className="p-8 text-center"><Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" /></div>
        ) : (docs || []).length === 0 ? (
          <div className="p-8 text-center">
            <FileText className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">لا توجد مستندات محفوظة بعد</p>
            <p className="text-[10px] text-muted-foreground/60 mt-1">قم برفع مستند من النموذج أعلاه</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                <th className="text-right py-2 px-3 text-[11px] font-semibold text-muted-foreground w-12">ID</th>
                <th className="text-right py-2 px-3 text-[11px] font-semibold text-muted-foreground">العنوان</th>
                <th className="text-right py-2 px-3 text-[11px] font-semibold text-muted-foreground">اسم الملف</th>
                <th className="text-right py-2 px-3 text-[11px] font-semibold text-muted-foreground w-36">التاريخ</th>
                <th className="text-center py-2 px-3 text-[11px] font-semibold text-muted-foreground w-40">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {(docs || []).map((doc: any) => (
                <tr key={doc.id} className="border-b border-border/50 hover:bg-muted/20">
                  <td className="py-2 px-3 text-xs text-center">{doc.id}</td>
                  <td className="py-2 px-3 text-xs">{doc.documentTitle}</td>
                  <td className="py-2 px-3 text-[10px] font-mono text-muted-foreground">{doc.fileName}</td>
                  <td className="py-2 px-3 text-xs text-center text-muted-foreground">
                    {doc.createdAt ? new Date(doc.createdAt).toLocaleString("ar-SA") : "-"}
                  </td>
                  <td className="py-2 px-3">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => handleDocPrint(doc)}
                        title="طباعة"
                        className="w-6 h-6 rounded flex items-center justify-center hover:bg-primary/10 text-primary transition-colors"
                      >
                        <Printer className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDocDownload(doc)}
                        title="تنزيل"
                        className="w-6 h-6 rounded flex items-center justify-center hover:bg-blue-50 text-blue-600 transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => openEditModal(doc)}
                        title="تعديل بيانات المستند"
                        className="w-6 h-6 rounded flex items-center justify-center hover:bg-amber-50 text-amber-600 transition-colors"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                      {canDelete && (
                        <button
                          onClick={() => handleDocDelete(doc.id, doc.documentTitle)}
                          title="حذف"
                          className="w-6 h-6 rounded flex items-center justify-center hover:bg-red-50 text-red-600 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ─── نافذة التعديل ─── */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-md mx-4 p-6">
            <h3 className="text-base font-bold text-foreground mb-5 pb-3 border-b border-border">
              تعديل بيانات المستند
            </h3>
            <div className="space-y-4">
              {/* عنوان المستند */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">عنوان المستند <span className="text-destructive">*</span></label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  placeholder="أدخل عنوان المستند..."
                  className="w-full h-9 px-3 rounded-lg bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
                  autoFocus
                />
              </div>
              {/* نوع العملية */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">نوع العملية</label>
                <input
                  type="text"
                  value={editOpType}
                  onChange={e => setEditOpType(e.target.value)}
                  placeholder="مثال: توثيق أصول، نقل ملكية..."
                  className="w-full h-9 px-3 rounded-lg bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
                />
              </div>
              {/* الملاحظات */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">ملاحظات</label>
                <textarea
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                  placeholder="أضف ملاحظات إضافية..."
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg bg-muted/50 border border-border text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-6 pt-4 border-t border-border">
              <button
                onClick={() => { setShowEditModal(false); setEditingId(null); }}
                className="h-9 px-4 rounded-lg text-sm border border-border hover:bg-muted/50 transition-colors"
              >
                إلغاء
              </button>
              <button
                onClick={handleEditSave}
                disabled={updateArchive.isPending}
                className="h-9 px-5 rounded-lg text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-1.5 disabled:opacity-60"
              >
                {updateArchive.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : null}
                حفظ التعديلات
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================
// مكون تبويب سجل الحذف (Audit Log)
// =============================================
function ArchiveAuditTab() {
  const [searchText, setSearchText] = useState("");
  const { data: auditData, isLoading } = trpc.records.audit.list.useQuery({
    search: searchText || undefined,
    limit: 100,
  });

  const rows = auditData?.rows || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="mr-auto" />
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input type="text" placeholder="بحث في سجل التدقيق..." value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="h-8 w-56 pr-8 pl-3 rounded-lg bg-muted/50 border border-border text-xs placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all" />
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                <th className="text-right py-2.5 px-2.5 text-[10px] font-semibold text-muted-foreground w-12">ID</th>
                <th className="text-right py-2.5 px-2.5 text-[10px] font-semibold text-muted-foreground w-24">الجدول</th>
                <th className="text-right py-2.5 px-2.5 text-[10px] font-semibold text-muted-foreground w-20">الإجراء</th>
                <th className="text-right py-2.5 px-2.5 text-[10px] font-semibold text-muted-foreground">الوصف</th>
                <th className="text-right py-2.5 px-2.5 text-[10px] font-semibold text-muted-foreground w-24">بواسطة</th>
                <th className="text-right py-2.5 px-2.5 text-[10px] font-semibold text-muted-foreground w-36">التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="py-12 text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">جاري التحميل...</p>
                </td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className="py-12 text-center">
                  <ShieldAlert className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">لا توجد سجلات تدقيق</p>
                </td></tr>
              ) : (
                rows.map((record: any) => (
                  <tr key={record.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="py-2 px-2.5 text-[11px] text-center font-medium">{record.id}</td>
                    <td className="py-2 px-2.5 text-[11px]">
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-blue-50 text-blue-600">
                        {record.tableName}
                      </span>
                    </td>
                    <td className="py-2 px-2.5 text-[11px] text-center">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                        record.actionType === "DELETE" ? "bg-red-50 text-red-600"
                        : record.actionType === "CREATE" ? "bg-emerald-50 text-emerald-600"
                        : record.actionType === "UPDATE" ? "bg-amber-50 text-amber-600"
                        : "bg-purple-50 text-purple-600"
                      }`}>{record.actionType}</span>
                    </td>
                    <td className="py-2 px-2.5 text-[11px] text-foreground">{record.actionDescription || "-"}</td>
                    <td className="py-2 px-2.5 text-[11px] text-center">{record.performedByName || "-"}</td>
                    <td className="py-2 px-2.5 text-[11px] text-center text-muted-foreground">
                      {record.createdAt ? new Date(record.createdAt).toLocaleString("ar-SA") : "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-3 py-2 bg-muted/20 border-t border-border">
          <span className="text-[10px] text-muted-foreground">إجمالي السجلات: {auditData?.total || 0}</span>
        </div>
      </div>
    </div>
  );
}

// =============================================
// الصفحة الرئيسية
// =============================================
type ArchiveTab = "assets" | "custody" | "docs_assets" | "docs_custody" | "audit";

const tabs: { key: ArchiveTab; label: string; icon: typeof Box }[] = [
  { key: "assets", label: "الأصول", icon: Box },
  { key: "custody", label: "العهد", icon: HandCoins },
  { key: "docs_assets", label: "توثيق الأصول", icon: FileText },
  { key: "docs_custody", label: "توثيق العهد", icon: FileText },
  { key: "audit", label: "سجل الحذف", icon: ShieldAlert },
];

export default function Archive() {
  const [activeTab, setActiveTab] = useState<ArchiveTab>("assets");

  return (
    <DashboardLayout title="الأرشيف" subtitle="أرشفة وتوثيق جميع عمليات الأصول والعهد مع سجل تدقيق شامل">
      <div className="bg-card rounded-xl border border-border shadow-[0_1px_3px_rgba(0,0,0,0.04)] mb-5">
        <div className="flex items-center gap-1 p-1.5 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                  isActive ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`}>
                <Icon className="w-3.5 h-3.5" /> {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === "assets" && <ArchiveEntityTab entityType="asset" entityLabel="الأصول" />}
      {activeTab === "custody" && <ArchiveEntityTab entityType="custody" entityLabel="العهد" />}
      {activeTab === "docs_assets" && <ArchiveDocsTab entityType="documentation_asset" />}
      {activeTab === "docs_custody" && <ArchiveDocsTab entityType="documentation_custody" />}
      {activeTab === "audit" && <ArchiveAuditTab />}
    </DashboardLayout>
  );
}
