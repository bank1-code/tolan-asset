/**
 * Archive.tsx - الأرشيف
 * مربوط بالـ API الحقيقي عبر tRPC
 */
import { openArchiveReportAsync, downloadArchiveReport, downloadArchiveDocument } from "@/lib/archiveReport";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
import {
  Archive as ArchiveIcon, Box, Download, Eye, FileText, FolderOpen,
  HandCoins, Printer, RefreshCw, Search, ShieldAlert, Trash2, Upload, Loader2
} from "lucide-react";

// =============================================
// مكون تبويب أرشيف (أصول أو عهد)
// =============================================
function ArchiveEntityTab({ entityType, entityLabel }: { entityType: string; entityLabel: string }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [searchText, setSearchText] = useState("");
  const [offset,setOffset]=useState(0);
  useEffect(()=>{setOffset(0);setSelectedId(null);},[entityType]);

  const { data: records, isLoading, error, refetch } = trpc.records.archive.list.useQuery({
    entityType,
    search: searchText || undefined,
    limit:100,offset,
  });
  const {data:count}=trpc.records.archive.count.useQuery({entityType,search:searchText||undefined});
  const utils = trpc.useUtils();

  const filteredRecords = records || [];

  const handlePrint = async () => { if(!selectedId){toast.warning("اختر وثيقة أولاً");return;}try{await openArchiveReportAsync(()=>utils.records.archive.getById.fetch({id:selectedId}));}catch(e:any){toast.error(e.message||"تعذر عرض الوثيقة");} };
  const handleDownload=async()=>{if(!selectedId){toast.warning("اختر وثيقة أولاً");return;}try{downloadArchiveReport(await utils.records.archive.getById.fetch({id:selectedId}));}catch(e:any){toast.error(e.message||"تعذر تحميل الوثيقة");}};

  return (
    <div className="space-y-4">
      {/* شريط الأدوات */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5"
          onClick={handlePrint}>
          <Eye className="w-3.5 h-3.5" /> عرض
        </Button>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5"
          onClick={handleDownload}>
          <Download className="w-3.5 h-3.5" /> حفظ نسخة
        </Button>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={handlePrint}>
          <Printer className="w-3.5 h-3.5" /> طباعة
        </Button>
        <p className="text-xs text-muted-foreground">الوثائق التاريخية ثابتة؛ يمكن عرضها وطباعتها وحفظ نسخة.</p>
        <div className="mr-auto" />
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input type="text" placeholder={`بحث في أرشيف ${entityLabel}...`} value={searchText}
            onChange={(e) => {setSearchText(e.target.value);setOffset(0);setSelectedId(null);}}
            className="h-8 w-56 pr-8 pl-3 rounded-lg bg-muted/50 border border-border text-xs placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all" />
        </div>
      </div>

      {error&&<p role="alert" className="text-sm text-destructive">تعذر تحميل الأرشيف: {error.message}</p>}
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
          <ArchivePagination offset={offset} total={count?.total??0} count={filteredRecords.length} busy={isLoading} onChange={value=>{setOffset(value);setSelectedId(null);}}/>
        </div>
      </div>
    </div>
  );
}
function ArchivePagination({offset,total,count,busy,onChange}:{offset:number;total:number;count:number;busy:boolean;onChange:(offset:number)=>void}){
 return <div className="flex items-center justify-between gap-3 text-xs"><span>{busy?'جاري تحميل الوثائق…':`عرض ${count?offset+1:0}–${count?offset+count:0} من أصل ${total}`}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={busy||offset===0} onClick={()=>onChange(Math.max(0,offset-100))}>السابق</Button><Button variant="outline" size="sm" disabled={busy||offset+count>=total} onClick={()=>onChange(offset+100)}>التالي</Button></div></div>;
}

// =============================================
// مكون تبويب التوثيق (رفع ملفات)
// =============================================
function ArchiveDocsTab({ entityType }: { entityType: "documentation_asset" | "documentation_custody" }) {
  const [docTitle, setDocTitle] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [offset,setOffset]=useState(0);
  useEffect(()=>setOffset(0),[entityType]);
  const label = entityType === "documentation_asset" ? "الأصول" : "العهد";

  const createArchive = trpc.records.archive.create.useMutation();
  const { data: docs, isLoading, error } = trpc.records.archive.list.useQuery({ entityType,limit:100,offset });
  const {data:count}=trpc.records.archive.count.useQuery({entityType});
  const utils = trpc.useUtils();

  const handleDocPrint = async(doc:any)=>{try{await openArchiveReportAsync(()=>utils.records.archive.getById.fetch({id:doc.id}));}catch(e:any){toast.error(e.message||"تعذر عرض الوثيقة");}};
  const handleDocDownload = async(doc:any)=>{try{downloadArchiveDocument(await utils.records.archive.getById.fetch({id:doc.id}));}catch(e:any){toast.error(e.message||"تعذر تحميل الوثيقة");}};

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
      utils.records.archive.count.invalidate();setOffset(0);
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

      {error&&<p role="alert" className="text-sm text-destructive">تعذر تحميل المستندات: {error.message}</p>}
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

                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <ArchivePagination offset={offset} total={count?.total??0} count={docs?.length??0} busy={isLoading} onChange={setOffset}/>

      {/* ─── نافذة التعديل ─── */}

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
