import { escapeHtml } from "@shared/html";
import { canApprove as hasApprovalRole, canOperate as hasOperatorRole } from "@shared/roles";
import { remainingQuantity } from "@shared/inventoryQuantity";
/*
 * Design: Calm Luxury - إدارة العهد
 * مربوطة بالـ API الحقيقي عبر tRPC
 */
import { openArchiveReport } from "@/lib/archiveReport";
import DashboardLayout from "@/components/DashboardLayout";
import DataTable from "@/components/DataTable";
import StatusBadge from "@/components/StatusBadge";
import { InventoryApprovalDialog } from "@/components/InventoryApprovalDialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import {
  Activity,
  Camera,
  Download,
  Edit,
  Eye,
  FileText,
  Filter,
  ImageIcon,
  Loader2,
  Plus,
  Printer,
  Receipt,
  Trash2,
  Upload,
  X,
  ZoomIn,
} from "lucide-react";
import { useRef, useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { CustodyExcelButtons } from "@/components/ExcelButtons";
import { useAuth } from "@/_core/hooks/useAuth";

const CUSTODY_CONDITIONS = ["جيد جدًا", "جيد", "متهالك"];

function getMonthlyCodePreview(
  prefix: string | null | undefined,
  sequence: number | null | undefined,
  sequencePeriod: string | null | undefined
) {
  if (!prefix) return null;

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Riyadh",
    month: "2-digit",
    year: "2-digit",
  }).formatToParts(new Date());
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const year = parts.find((part) => part.type === "year")?.value ?? "00";
  const period = `${month}${year}`;
  const nextSequence = sequencePeriod === period ? Number(sequence || 0) + 1 : 1;
  const serial = String(nextSequence).padStart(2, "0");

  return `${prefix}-${period}${serial}`;
}


interface CustodyFormData {
  name: string;
  code: string;
  quantity: string;
  asset_value: string;
  classification_id: string;
  assigned_to: string;
  department: string;
  branch: string;
  location: string;
  condition: string;
  notes: string;
  custody_image: File | null;
  invoice_image: File | null;
}

const emptyForm: CustodyFormData = {
  name: "",
  code: "",
  quantity: "1",
  asset_value: "",
  classification_id: "",
  assigned_to: "",
  department: "",
  branch: "",
  location: "",
  condition: "جيد جدًا",
  notes: "",
  custody_image: null,
  invoice_image: null,
};

/**
 * تحويل File إلى base64
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function Custody() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const canApprove = hasApprovalRole(user?.role);
  const canOperate = hasOperatorRole(user?.role);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterDept, setFilterDept] = useState("all");
  const [filterLocation, setFilterLocation] = useState("all");

  const [tablePage, setTablePage] = useState(1);
  const [tableSearch, setTableSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => { const timer = setTimeout(() => setDebouncedSearch(tableSearch), 300); return () => clearTimeout(timer); }, [tableSearch]);
  useEffect(() => setTablePage(1), [filterDept, filterLocation, filterStatus, debouncedSearch]);
  const apiFilters = useMemo(() => ({
    search: debouncedSearch || undefined,
    departmentId: filterDept !== "all" ? Number(filterDept) : undefined,
    locationId: filterLocation !== "all" ? Number(filterLocation) : undefined,
    status: filterStatus !== "all" ? filterStatus : undefined,
  }), [filterDept, filterLocation, filterStatus, debouncedSearch]);

  const { data: custodyData, isLoading } = trpc.inventory.custody.list.useQuery({...apiFilters, limit: 50, offset: (tablePage - 1) * 50});
  const {data: tableTotal = 0} = trpc.inventory.custody.count.useQuery(apiFilters);
  useEffect(() => { if (tableTotal > 0 && tablePage > Math.ceil(tableTotal / 50)) setTablePage(Math.ceil(tableTotal / 50)); }, [tableTotal, tablePage]);
  const { data: departmentsData } = trpc.settings.departments.list.useQuery();
  const { data: locationsData } = trpc.settings.locations.list.useQuery();
  const { data: branchesData } = trpc.settings.branches.list.useQuery();
  const { data: financialClasses = [] } = trpc.depreciation.classifications.useQuery();
  const { data: employeesData } = trpc.settings.employees.list.useQuery();

  const utils = trpc.useUtils();
  const createCustody = trpc.inventory.custody.create.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.inventory.custody.invalidate(), utils.records.reports.dashboard.invalidate(), utils.settings.locations.list.invalidate()]);
    },
  });
  const updateCustody = trpc.inventory.custody.update.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.inventory.custody.invalidate(), utils.records.reports.dashboard.invalidate()]);
    },
  });
  const cancelCustodyDraft = trpc.inventory.custody.cancelDraft.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.inventory.custody.invalidate(), utils.records.reports.dashboard.invalidate()]);
    },
  });
  const approveDraft = trpc.inventory.custody.approve.useMutation();
  const [approvalCandidate, setApprovalCandidate] = useState<any>(null);
  const requestChanges = trpc.inventory.custody.requestChanges.useMutation();
  const refreshDrafts = async () => { await utils.inventory.custody.invalidate(); await utils.records.reports.dashboard.invalidate(); await utils.settings.locations.list.invalidate(); setShowView(null); };
  const handleApprove = (record: any) => setApprovalCandidate(record);
  const confirmApproval = async () => {
    if (!approvalCandidate || approveDraft.isPending) return;
    try { const result = await approveDraft.mutateAsync({ id: approvalCandidate.id, expectedVersion: approvalCandidate.draftVersion }); setApprovalCandidate(null); await refreshDrafts(); toast.success(`تم الاعتماد بالرقم: ${result.code}`); } catch (error: any) { toast.error(error.message); }
  };
  const handleRequestChanges = async (record: any) => {
    const note = prompt("اكتب الملاحظات المطلوبة لتصحيح المسودة:"); if (!note?.trim()) return;
    try { await requestChanges.mutateAsync({ id: record.id, expectedVersion: record.draftVersion, note }); await refreshDrafts(); toast.success("تم حفظ ملاحظات المراجعة"); } catch (error: any) { toast.error(error.message); }
  };
  const uploadImage = trpc.upload.image.useMutation();

  const items = custodyData || [];
  const departments = departmentsData || [];
  const locations_ = locationsData || [];
  const branches = branchesData || [];
  const employees = employeesData || [];

  const [showAdd, setShowAdd] = useState(false);
  const [showView, setShowView] = useState<any>(null);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [form, setForm] = useState<CustodyFormData>({ ...emptyForm });
  const formBranches = branches.filter((b: any) => !form.location || String(b.locationId) === form.location);
  const formDepartments = departments.filter((d: any) => !form.branch || String(d.branchId) === form.branch);
  // الموظف المستلم مستقل عن القسم الوظيفي؛ قسم وموقع الأصل/العهدة يخصان العنصر نفسه.
  const formEmployees = employees;
  const [savedData, setSavedData] = useState<CustodyFormData | null>(null);
  const [documentCode, setDocumentCode] = useState("");
  const [saveDate, setSaveDate] = useState("");
  const [custodyImagePreview, setCustodyImagePreview] = useState<string | null>(null);
  const [invoiceImagePreview, setInvoiceImagePreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

  // روابط الصور المرفوعة إلى S3
  const [uploadedCustodyImageUrl, setUploadedCustodyImageUrl] = useState<string | null>(null);
  const [uploadedInvoiceImageUrl, setUploadedInvoiceImageUrl] = useState<string | null>(null);

  // طباعة من الأرشيف
  const [archivePrintId, setArchivePrintId] = useState<number | null>(null);
  const { data: archiveDocForPrint } = trpc.records.archive.getByEntity.useQuery(
    { entityType: "custody", entityId: archivePrintId! },
    { enabled: archivePrintId !== null }
  );
  const prevArchivePrintId = useRef<number | null>(null);
  if (archivePrintId !== null && archiveDocForPrint !== undefined && archivePrintId !== prevArchivePrintId.current) {
    prevArchivePrintId.current = archivePrintId;
    if (archiveDocForPrint) openArchiveReport(archiveDocForPrint); else toast.warning("لا توجد وثيقة محفوظة لهذا السجل");
    setTimeout(() => setArchivePrintId(null), 100);
  }

  const custodyImageRef = useRef<HTMLInputElement>(null);
  const invoiceImageRef = useRef<HTMLInputElement>(null);

  const columns = [
    { key: "code", render: (record: any) => record.code || `مسودة #${record.id}`, label: "رمز العهدة", className: "font-mono text-xs font-bold text-primary" as string },
    { key: "name", label: "اسم العهدة", render: (i: any) => <span className="font-medium">{i.name}</span> },
    { key: "quantity", label: "الأصلية / المستبعد / المستبدل / المتبقي", className: "text-center" as string, render: (i: any) => <span className="text-center block">{i.quantity} / {i.excludedQuantity || 0} / {i.warrantyReplacedQuantity || 0} / {Math.max(0, remainingQuantity(i))}</span> },
    {
      key: "assetValue",
      label: "قيمة العهدة",
      render: (i: any) => (
        <span className="font-bold text-foreground">{Number(i.assetValue || 0).toLocaleString("ar-SA")} ر.س</span>
      ),
    },
    {
      key: "excludedQuantity",
      label: "المستبعد",
      className: "text-center" as string,
      render: (i: any) => (
        <span className={`text-center block ${(i.excludedQuantity || 0) > 0 ? "text-amber-600 font-bold" : "text-muted-foreground"}`}>
          {i.excludedQuantity || 0}
        </span>
      ),
    },
    { key: "employeeName", label: "في عهدة" },
    { key: "departmentName", label: "القسم", render: (i: any) => <span className="text-xs text-muted-foreground">{i.departmentName || "-"}</span> },
    { key: "locationName", label: "الموقع", render: (i: any) => <span className="text-xs text-muted-foreground">{i.locationName || "-"}</span> },
    {
      key: "images",
      label: "المرفقات",
      render: (i: any) => {
        const hasImages = i.assetImagePath || i.invoiceImagePath;
        return hasImages ? (
          <span className="text-green-600 text-xs font-medium flex items-center gap-1 justify-center">
            <ImageIcon className="w-3.5 h-3.5" />
            {[i.assetImagePath && "صورة", i.invoiceImagePath && "فاتورة"].filter(Boolean).join(" + ")}
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">-</span>
        );
      },
    },
    { key: "status", label: "الحالة", render: (i: any) => <StatusBadge status={i.status} /> },
  ];

  const handleImageSelect = (type: "custody" | "invoice") => {
    if (type === "custody") custodyImageRef.current?.click();
    else invoiceImageRef.current?.click();
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>, type: "custody" | "invoice") => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (type === "custody") {
        setForm((f) => ({ ...f, custody_image: file }));
        setCustodyImagePreview(ev.target?.result as string);
        setUploadedCustodyImageUrl(null); // إعادة تعيين الرابط المرفوع
      } else {
        setForm((f) => ({ ...f, invoice_image: file }));
        setInvoiceImagePreview(ev.target?.result as string);
        setUploadedInvoiceImageUrl(null);
      }
    };
    reader.readAsDataURL(file);
  };

  /**
   * رفع صورة واحدة إلى S3 وإرجاع الرابط
   */
  const uploadSingleImage = async (file: File, category: "custody" | "invoice"): Promise<string> => {
    const base64 = await fileToBase64(file);
    const result = await uploadImage.mutateAsync({
      base64,
      category: category === "custody" ? "custody" : "invoice",
    });
    return result.url;
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("اسم العهدة حقل إلزامي");
      return;
    }
    if (!Number.isSafeInteger(Number(form.quantity)) || Number(form.quantity) < 1) {
      toast.error("الكمية يجب أن تكون عددًا صحيحًا أكبر من صفر");
      return;
    }
    try {
      setIsUploading(true);

      // رفع الصور إلى S3 إن وجدت
      let custodyImageUrl: string | null = uploadedCustodyImageUrl;
      let invoiceImageUrl: string | null = uploadedInvoiceImageUrl;

      if (form.custody_image && !custodyImageUrl) {
        toast.info("جاري رفع صورة العهدة وتحويلها إلى WebP...");
        custodyImageUrl = await uploadSingleImage(form.custody_image, "custody");
        setUploadedCustodyImageUrl(custodyImageUrl);
      }
      if (form.invoice_image && !invoiceImageUrl) {
        toast.info("جاري رفع صورة الفاتورة وتحويلها إلى WebP...");
        invoiceImageUrl = await uploadSingleImage(form.invoice_image, "invoice");
        setUploadedInvoiceImageUrl(invoiceImageUrl);
      }

      const created = await createCustody.mutateAsync({
        name: form.name,
        quantity: Number(form.quantity),
        assetValue: form.asset_value || "0", classificationId: form.classification_id ? Number(form.classification_id) : null,
        condition: form.condition,
        assignedTo: Number(form.assigned_to),
        departmentId: Number(form.department),
        locationId: Number(form.location),
        notes: form.notes || null,
        assetImagePath: custodyImageUrl,
        invoiceImagePath: invoiceImageUrl,
      });
      const code = `DOC-CUS-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
      const date = new Date().toLocaleDateString("ar-SA", { year: "numeric", month: "2-digit", day: "2-digit" });
      setDocumentCode(code);
      setSaveDate(date);
      setForm((f) => ({ ...f, code: "" }));
      setSavedData(null);
      toast.success(
        <div className="space-y-1">
          <p className="font-bold">تم حفظ المسودة بنجاح</p>
          <p className="text-xs opacity-80">مرجع المسودة: #{created.id} — الرقم الرسمي عند الاعتماد</p>

          {(custodyImageUrl || invoiceImageUrl) && (
            <p className="text-xs opacity-80">تم رفع الصور بصيغة WebP</p>
          )}
        </div>
      );
      resetForm();
    } catch (error: any) {
      toast.error(error.message || "حدث خطأ أثناء الحفظ");
    } finally {
      setIsUploading(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingItem || !form.name.trim()) {
      toast.error("اسم العهدة حقل إلزامي");
      return;
    }
    if (!Number.isSafeInteger(Number(form.quantity)) || Number(form.quantity) < 1) {
      toast.error("الكمية يجب أن تكون عددًا صحيحًا أكبر من صفر");
      return;
    }
    try {
      setIsUploading(true);

      // رفع الصور الجديدة إلى S3 إن وجدت
      let custodyImageUrl: string | null = uploadedCustodyImageUrl || editingItem.assetImagePath || null;
      let invoiceImageUrl: string | null = uploadedInvoiceImageUrl || editingItem.invoiceImagePath || null;

      if (form.custody_image && !uploadedCustodyImageUrl) {
        toast.info("جاري رفع صورة العهدة وتحويلها إلى WebP...");
        custodyImageUrl = await uploadSingleImage(form.custody_image, "custody");
        setUploadedCustodyImageUrl(custodyImageUrl);
      }
      if (form.invoice_image && !uploadedInvoiceImageUrl) {
        toast.info("جاري رفع صورة الفاتورة وتحويلها إلى WebP...");
        invoiceImageUrl = await uploadSingleImage(form.invoice_image, "invoice");
        setUploadedInvoiceImageUrl(invoiceImageUrl);
      }

      await updateCustody.mutateAsync({
        id: editingItem.id, expectedVersion: editingItem.draftVersion,
        name: form.name,
        code: editingItem.code || null,
        quantity: Number(form.quantity),
        assetValue: form.asset_value || "0", classificationId: form.classification_id ? Number(form.classification_id) : null,
        condition: form.condition,
        assignedTo: Number(form.assigned_to),
        departmentId: Number(form.department),
        locationId: Number(form.location),
        notes: form.notes || null,
        assetImagePath: custodyImageUrl,
        invoiceImagePath: invoiceImageUrl,
      });
      toast.success("تم تعديل المسودة بنجاح");
      resetForm();
    } catch (error: any) {
      toast.error(error.message || "حدث خطأ أثناء التعديل");
    } finally {
      setIsUploading(false);
    }
  };

  const handleCancelDraft = async (item: any) => {
    if (!confirm("إلغاء المسودة مع الاحتفاظ بسجلها؟")) return;
    try {
      await cancelCustodyDraft.mutateAsync({ id: item.id, expectedVersion: item.draftVersion });
      toast.success("تم إلغاء المسودة");
    } catch (error: any) {
      toast.error(error.message || "حدث خطأ أثناء الإلغاء");
    }
  };

  const startEdit = (item: any) => {
    if (item.status !== "DRAFT" || !canOperate) { toast.error("التعديل متاح للمسودات فقط"); return; }
    setEditingItem(item);
    setForm({
      name: item.name,
      code: item.code || "",
      quantity: String(item.quantity),
      asset_value: String(item.assetValue || ""),
      classification_id: item.classificationId ? String(item.classificationId) : "",
      assigned_to: item.assignedTo ? String(item.assignedTo) : "",
      department: item.departmentId ? String(item.departmentId) : "",
      branch: item.branchId ? String(item.branchId) : "",
      location: item.locationId ? String(item.locationId) : "",
      condition: item.condition || "جيد جدًا",
      notes: item.notes || "",
      custody_image: null,
      invoice_image: null,
    });
    // عرض الصور المحفوظة مسبقاً
    setCustodyImagePreview(item.assetImagePath || null);
    setInvoiceImagePreview(item.invoiceImagePath || null);
    setUploadedCustodyImageUrl(item.assetImagePath || null);
    setUploadedInvoiceImageUrl(item.invoiceImagePath || null);
    setSavedData(null);
    setShowAdd(true);
  };

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow || !savedData) return;

    const empName = employees.find((e) => String(e.id) === savedData.assigned_to)?.fullName || savedData.assigned_to || "-";
    const deptName = departments.find((d) => String(d.id) === savedData.department)?.name || savedData.department || "-";
    const locName = locations_.find((l) => String(l.id) === savedData.location)?.name || savedData.location || "-";

    // إضافة الصور في الطباعة
    const custodyImgHtml = uploadedCustodyImageUrl
      ? `<div class="image-section"><h3>صورة العهدة</h3><img src="${escapeHtml(uploadedCustodyImageUrl)}" alt="صورة العهدة" /></div>`
      : "";
    const invoiceImgHtml = uploadedInvoiceImageUrl
      ? `<div class="image-section"><h3>صورة الفاتورة</h3><img src="${escapeHtml(uploadedInvoiceImageUrl)}" alt="صورة الفاتورة" /></div>`
      : "";

    const html = `
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="utf-8">
      <title>كشف إضافة عهدة جديدة - ${escapeHtml(documentCode)}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Tajawal', Arial, sans-serif; background: #fff; color: #1a1a2e; margin: 40px; direction: rtl; }
        .header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 12px; border-bottom: 3px solid #0d9488; margin-bottom: 20px; }
        .header .date { color: #64748b; font-size: 13px; }
        .header .doc-code { background: #f0fdfa; color: #0d9488; padding: 4px 12px; border-radius: 6px; font-weight: 700; font-size: 13px; }
        h2 { color: #0d9488; text-align: center; margin: 16px 0; font-size: 20px; }
        table { width: 100%; border-collapse: collapse; margin: 16px 0; }
        th, td { border: 1px solid #e2e8f0; padding: 10px 14px; text-align: right; font-size: 14px; }
        th { background: #f8fafc; color: #64748b; font-weight: 700; width: 30%; }
        td { color: #1a1a2e; }
        .image-section { margin: 20px 0; text-align: center; }
        .image-section h3 { color: #0d9488; font-size: 16px; margin-bottom: 10px; }
        .image-section img { max-width: 400px; max-height: 300px; border: 2px solid #e2e8f0; border-radius: 8px; }
        .signatures { margin-top: 40px; }
        .signatures table { border: none; }
        .signatures td { border: none; text-align: center; font-weight: 700; color: #64748b; }
        .signatures .line { border-top: 1px solid #94a3b8; margin-top: 40px; width: 80%; margin-inline: auto; }
        .footer { text-align: center; margin-top: 30px; color: #94a3b8; font-size: 11px; }
        @media print { body { margin: 20px; } }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="doc-code">${escapeHtml(documentCode)}</div>
        <div class="date">${escapeHtml(saveDate)}</div>
      </div>
      <h2>كشف إضافة عهدة جديدة</h2>
      <table>
        <tr><th>اسم العهدة</th><td>${escapeHtml(savedData.name)}</td></tr>
        <tr><th>رمز العهدة</th><td>${escapeHtml(savedData.code)}</td></tr>
        <tr><th>الكمية</th><td>${escapeHtml(savedData.quantity)}</td></tr>
        <tr><th>قيمة العهدة</th><td>${escapeHtml(savedData.asset_value ? Number(savedData.asset_value).toLocaleString("ar-SA") + " ر.س" : "-")}</td></tr>
        <tr><th>في عهدة</th><td>${escapeHtml(empName)}</td></tr>
        <tr><th>القسم</th><td>${escapeHtml(deptName)}</td></tr>
        <tr><th>موقع العهدة</th><td>${escapeHtml(locName)}</td></tr>
        <tr><th>حالة العهدة</th><td>${escapeHtml(savedData.condition)}</td></tr>
        <tr><th>ملاحظات</th><td>${escapeHtml(savedData.notes || "-")}</td></tr>
      </table>
      ${custodyImgHtml}
      ${invoiceImgHtml}
      <div class="signatures">
        <table><tr>
          <td>مسؤول العهد<div class="line"></div></td>
          <td>الإدارة العليا<div class="line"></div></td>
        </tr></table>
      </div>
      <div class="footer">المستند رقم: ${escapeHtml(documentCode)} | تاريخ: ${escapeHtml(saveDate)}</div>
    </body></html>`;
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const resetForm = () => {
    setForm({ ...emptyForm });
    setSavedData(null);
    setEditingItem(null);
    setDocumentCode("");
    setSaveDate("");
    setCustodyImagePreview(null);
    setInvoiceImagePreview(null);
    setUploadedCustodyImageUrl(null);
    setUploadedInvoiceImageUrl(null);
    setShowAdd(false);
  };

  if (isLoading) {
    return (
      <DashboardLayout title="إدارة العهد" subtitle="جاري التحميل...">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title="إدارة العهد"
      subtitle={`${tableTotal} عهدة`}
      actions={
        <div className="flex items-center gap-2 w-full flex-wrap">
          <div className="flex items-center gap-2 flex-1">
            <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-8 w-36 text-xs">
                <SelectValue placeholder="الحالة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الحالات</SelectItem>
                <SelectItem value="ACTIVE">نشط</SelectItem>
                <SelectItem value="EXCLUDED_PARTIAL">مستبعد جزئياً</SelectItem>
                <SelectItem value="REPLACED">مستبدل بالضمان</SelectItem><SelectItem value="EXCLUDED">مستبعد كلياً</SelectItem>
                <SelectItem value="DRAFT">مسودة بانتظار الاعتماد</SelectItem>
                <SelectItem value="CANCELLED">مسودة ملغاة</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterDept} onValueChange={setFilterDept}>
              <SelectTrigger className="h-8 w-44 text-xs">
                <SelectValue placeholder="القسم" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الأقسام</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterLocation} onValueChange={setFilterLocation}>
              <SelectTrigger className="h-8 w-40 text-xs">
                <SelectValue placeholder="الموقع" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع المواقع</SelectItem>
                {locations_.map((l) => (
                  <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <CustodyExcelButtons />
            <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => { setForm({ ...emptyForm }); setEditingItem(null); setSavedData(null); setCustodyImagePreview(null); setInvoiceImagePreview(null); setUploadedCustodyImageUrl(null); setUploadedInvoiceImageUrl(null); setShowAdd(true); }}>
              <Plus className="w-3.5 h-3.5" />
              إضافة عهدة
            </Button>
          </div>
        </div>
      }
    >
      <DataTable
        pageSize={50}
        serverPagination={{page: tablePage, total: tableTotal, onPageChange: setTablePage, search: tableSearch, onSearchChange: (value) => {setTableSearch(value); setTablePage(1);}}}
        data={items}
        columns={columns}
        searchKeys={["name", "code", "employeeName", "departmentName", "locationName", "condition", "status", "assetValue", "notes"]}
        searchPlaceholder="بحث في جميع الحقول..."
        onRowClick={(i) => setShowView(i)}
        actions={(i) => (
          <div className="flex items-center justify-center gap-1">
            <button onClick={(e) => { e.stopPropagation(); setShowView(i); }} className="w-7 h-7 rounded-md hover:bg-muted flex items-center justify-center transition-colors" title="عرض">
              <Eye className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            {canOperate && i.status === "DRAFT" && (<button onClick={(e) => { e.stopPropagation(); startEdit(i); }} className="w-7 h-7 rounded-md hover:bg-muted flex items-center justify-center transition-colors" title="تعديل">
              <Edit className="w-3.5 h-3.5 text-muted-foreground" />
            </button>)}
            {i.status !== "DRAFT" && i.status !== "CANCELLED" && (<button onClick={(e) => { e.stopPropagation(); prevArchivePrintId.current = null; setArchivePrintId(i.id); }} className="w-7 h-7 rounded-md hover:bg-teal-50 flex items-center justify-center transition-colors" title="طباعة من الأرشيف">
              <Printer className="w-3.5 h-3.5 text-teal-600" />
            </button>)}
            <button onClick={(e) => { e.stopPropagation(); setLocation(`/tracking?type=custody&id=${i.id}&name=${encodeURIComponent(i.name)}&code=${encodeURIComponent(i.code || '')}`); }} className="w-7 h-7 rounded-md hover:bg-violet-50 flex items-center justify-center transition-colors" title="عرض التتبع">
              <Activity className="w-3.5 h-3.5 text-violet-500" />
            </button>
            {canOperate && i.status === "DRAFT" && (
              <button onClick={(e) => { e.stopPropagation(); handleCancelDraft(i); }} className="w-7 h-7 rounded-md hover:bg-red-50 flex items-center justify-center transition-colors" title="إلغاء المسودة">
                <Trash2 className="w-3.5 h-3.5 text-red-400" />
              </button>
            )}
          </div>
        )}
      />

      {/* View Dialog - مع عرض الصور */}
      <Dialog open={!!showView} onOpenChange={() => setShowView(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Eye className="w-5 h-5 text-primary" />
              تفاصيل العهدة
            </DialogTitle>
          </DialogHeader>
          {showView && (
            <div className="space-y-4">
              <div className="bg-muted/30 rounded-xl p-4 border border-border/50">
                <div className="grid grid-cols-2 gap-4">
                  <InfoField label="رمز العهدة" value={showView.code || "-"} highlight />
                  <InfoField label="اسم العهدة" value={showView.name} />
                  <InfoField label="الكمية الأصلية" value={String(showView.quantity)} /><InfoField label="المستبعد سابقاً" value={String(showView.excludedQuantity || 0)} /><InfoField label="المستبدل بالضمان" value={String(showView.warrantyReplacedQuantity || 0)} /><InfoField label="معرفات الوحدات" value={Array.isArray(showView.serialNumbers) ? showView.serialNumbers.join("، ") : "—"} /><InfoField label="نهاية الضمان" value={showView.warrantyEndDate || "—"} /><InfoField label="المتبقي الفعلي" value={String(Math.max(0, remainingQuantity(showView)))} />
                  <InfoField label="قيمة العهدة" value={`${Number(showView.assetValue || 0).toLocaleString("ar-SA")} ر.س`} />
                  <InfoField label="في عهدة" value={showView.employeeName || "-"} />
                  <InfoField label="القسم" value={showView.departmentName || "-"} />
                  <InfoField label="موقع العهدة" value={showView.locationName || "-"} />
                  <InfoField label="حالة العهدة" value={showView.condition || "-"} />
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div>
                  <span className="text-[11px] font-bold text-muted-foreground block mb-1">الحالة</span>
                  <StatusBadge status={showView.status} />
                </div>
              </div>
              {showView.status === "DRAFT" && <div className="bg-amber-50 rounded-lg p-3 space-y-2 text-sm">
                <p>هذه مسودة؛ لا تدخل في النقل أو الاستبعاد أو الجرد حتى الاعتماد.</p>
                {showView.reviewNote && <p>ملاحظات المختص: {showView.reviewNote}</p>}
                {canApprove && <div className="flex gap-2"><Button onClick={() => handleApprove(showView)} disabled={approveDraft.isPending}>اعتماد وقفل البيانات</Button><Button variant="outline" onClick={() => handleRequestChanges(showView)} disabled={requestChanges.isPending}>طلب تصحيح</Button></div>}
              </div>}
              {showView.approvedAt && <p className="text-xs text-muted-foreground">اعتمده {showView.approvalSnapshot?.approvedByName || showView.approvedBy} بتاريخ {new Date(showView.approvedAt).toLocaleString("ar-SA")}</p>}
              {showView.status !== "DRAFT" && showView.status !== "CANCELLED" && <p className="text-xs text-muted-foreground">البيانات مقفلة. تغيير المستلم والقسم والموقع يتم عبر النقل.</p>}
              {showView.notes && (
                <div>
                  <span className="text-[11px] font-bold text-muted-foreground block mb-1">ملاحظات</span>
                  <p className="text-sm text-foreground bg-muted/50 rounded-lg p-3">{showView.notes}</p>
                </div>
              )}

              {/* عرض الصور المحفوظة */}
              {(showView.assetImagePath || showView.invoiceImagePath) && (
                <div className="border border-border rounded-xl overflow-hidden">
                  <div className="bg-muted/50 px-4 py-2.5 border-b border-border">
                    <h3 className="text-sm font-bold flex items-center gap-2">
                      <Camera className="w-4 h-4 text-primary" />
                      المرفقات
                    </h3>
                  </div>
                  <div className="p-4 grid grid-cols-2 gap-4">
                    {showView.assetImagePath && (
                      <div className="space-y-2">
                        <span className="text-xs font-bold text-muted-foreground">صورة العهدة</span>
                        <div className="relative group rounded-lg overflow-hidden border border-border cursor-pointer" onClick={() => setImagePreviewUrl(showView.assetImagePath)}>
                          <img src={showView.assetImagePath} alt="صورة العهدة" className="w-full h-40 object-cover" />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                            <ZoomIn className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </div>
                      </div>
                    )}
                    {showView.invoiceImagePath && (
                      <div className="space-y-2">
                        <span className="text-xs font-bold text-muted-foreground">صورة الفاتورة</span>
                        <div className="relative group rounded-lg overflow-hidden border border-border cursor-pointer" onClick={() => setImagePreviewUrl(showView.invoiceImagePath)}>
                          <img src={showView.invoiceImagePath} alt="صورة الفاتورة" className="w-full h-40 object-cover" />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                            <ZoomIn className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Image Preview Dialog - عرض الصورة بالحجم الكامل */}
      <Dialog open={!!imagePreviewUrl} onOpenChange={() => setImagePreviewUrl(null)}>
        <DialogContent className="max-w-3xl p-2" dir="rtl">
          {imagePreviewUrl && (
            <img src={imagePreviewUrl} alt="معاينة الصورة" className="w-full h-auto rounded-lg" />
          )}
        </DialogContent>
      </Dialog>

      {/* Add/Edit Dialog */}
      <Dialog open={showAdd} onOpenChange={(open) => { if (!open) resetForm(); }}>
        <DialogContent
          className="max-w-3xl max-h-[92vh] overflow-hidden p-0 gap-0 grid-rows-[auto_minmax(0,1fr)_auto]"
          dir="rtl"
          onInteractOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => event.preventDefault()}
        >
          <DialogHeader className="border-b border-border px-6 py-5 pr-12 text-right">
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              {editingItem ? <Edit className="w-5 h-5 text-primary" /> : <Plus className="w-5 h-5 text-primary" />}
              {editingItem ? "تعديل عهدة" : "إضافة عهدة جديدة"}
            </DialogTitle>
            <p className="text-xs text-muted-foreground mt-1">
              تُحفظ البيانات كمسودة قابلة للتعديل. يُولد الرقم الرسمي وتُقفل البيانات عند اعتماد المختص.
            </p>
          </DialogHeader>

          <div className="min-h-0 overflow-y-auto px-6 py-5 space-y-5">
            {/* البيانات الأساسية */}
            <section className="rounded-xl border border-border bg-muted/10 p-4 space-y-4">
              <div>
                <h3 className="text-sm font-bold text-foreground">البيانات الأساسية</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">بيانات تعريف العهدة وقيمتها.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                <div className="space-y-2"><label className="text-xs font-bold">التصنيف المالي</label><select className="w-full border rounded-lg h-10 px-3 bg-background" value={form.classification_id} onChange={e => setForm(f => ({ ...f, classification_id: e.target.value }))}><option value="">غير مصنف — يحتاج تهيئة قبل الإهلاك</option>{financialClasses.filter(c => c.active).map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}</select></div>
                <FormField label="اسم العهدة" required value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="أدخل اسم العهدة" />
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground">رمز العهدة</label>
                  <div className="min-h-10 px-3 py-2 rounded-lg bg-background border border-dashed border-border text-sm flex items-center font-mono text-muted-foreground leading-5">
                    {form.code
                      ? form.code
                      : (() => {
                          const loc: any = locations_.find((l: any) => String(l.id) === form.location);
                          return getMonthlyCodePreview(loc?.custodyPrefix, loc?.custodySequence, loc?.custodySequencePeriod)
                            || "يُولد تلقائياً بعد اختيار الموقع";
                        })()}
                  </div>
                  <p className="text-[10px] leading-4 text-muted-foreground">
                    الرقم المعروض تقديري، ويُولد نهائياً عند اعتماد المسودة. ولا يتغير عند نقل العهدة لاحقاً.
                  </p>
                </div>
                <FormField label="الكمية" value={form.quantity} onChange={(v) => setForm((f) => ({ ...f, quantity: v }))} type="number" placeholder="1" />
                <FormField label="قيمة العهدة" value={form.asset_value} onChange={(v) => setForm((f) => ({ ...f, asset_value: v }))} type="number" placeholder="0.00" />
              </div>
            </section>

            {/* الموقع والتخصيص */}
            <section className="rounded-xl border border-border bg-muted/10 p-4 space-y-4">
              <div>
                <h3 className="text-sm font-bold text-foreground">الموقع والتخصيص</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">اختر الموقع ثم الفرع والقسم والموظف المستلم.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground">موقع العهدة <span className="text-red-500">*</span></label>
                  <Select value={form.location} onValueChange={(v) => setForm((f) => ({ ...f, location: v, branch: "", department: "", assigned_to: "" }))}>
                    <SelectTrigger className="h-10 text-sm"><SelectValue placeholder="اختر الموقع أولاً" /></SelectTrigger>
                    <SelectContent>
                      {locations_.map((l: any) => <SelectItem key={l.id} value={String(l.id)}>{l.code ? `${l.code} — ` : ""}{l.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground">الفرع <span className="text-red-500">*</span></label>
                  <Select value={form.branch} disabled={!form.location} onValueChange={(v) => setForm((f) => ({ ...f, branch: v, department: "", assigned_to: "" }))}>
                    <SelectTrigger className="h-10 text-sm"><SelectValue placeholder={form.location ? "اختر الفرع" : "اختر الموقع أولاً"} /></SelectTrigger>
                    <SelectContent>{formBranches.map((b: any) => <SelectItem key={b.id} value={String(b.id)}>{b.code ? `${b.code} — ` : ""}{b.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground">القسم <span className="text-red-500">*</span></label>
                  <Select value={form.department} disabled={!form.branch} onValueChange={(v) => setForm((f) => ({ ...f, department: v, assigned_to: "" }))}>
                    <SelectTrigger className="h-10 text-sm"><SelectValue placeholder={form.branch ? "اختر القسم" : "اختر الفرع أولاً"} /></SelectTrigger>
                    <SelectContent>
                      {formDepartments.map((d: any) => <SelectItem key={d.id} value={String(d.id)}>{d.code ? `${d.code} — ` : ""}{d.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground">في عهدة <span className="text-red-500">*</span></label>
                  <Select value={form.assigned_to} onValueChange={(v) => setForm((f) => ({ ...f, assigned_to: v }))}>
                    <SelectTrigger className="h-10 text-sm"><SelectValue placeholder="اختر الموظف المستلم" /></SelectTrigger>
                    <SelectContent>
                      {formEmployees.map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.code ? `${e.code} — ` : ""}{e.fullName}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>

            {/* الحالة والملاحظات */}
            <section className="rounded-xl border border-border bg-muted/10 p-4">
              <div className="grid grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)] gap-4 items-start">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground">حالة العهدة</label>
                  <Select value={form.condition} onValueChange={(v) => setForm((f) => ({ ...f, condition: v }))}>
                    <SelectTrigger className="h-10 text-sm"><SelectValue placeholder="اختر الحالة" /></SelectTrigger>
                    <SelectContent>
                      {CUSTODY_CONDITIONS.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground">ملاحظات</label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    placeholder="أدخل أي ملاحظات..."
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all resize-none"
                  />
                </div>
              </div>
            </section>

            {/* المرفقات */}
            <section className="border border-border rounded-xl overflow-hidden">
              <div className="bg-muted/50 px-4 py-2.5 border-b border-border">
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <Camera className="w-4 h-4 text-primary" />
                  المرفقات
                  <span className="text-[10px] text-muted-foreground font-normal">(يتم التحويل تلقائياً إلى WebP)</span>
                </h3>
              </div>
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-lg border border-border p-3 space-y-3 bg-background">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold">صورة العهدة</span>
                    {(form.custody_image || custodyImagePreview) && (
                      <button type="button" aria-label="إزالة صورة العهدة" onClick={() => { setForm((f) => ({ ...f, custody_image: null })); setCustodyImagePreview(null); setUploadedCustodyImageUrl(null); }} className="text-red-400 hover:text-red-600 transition-colors">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <span className="text-[11px] text-muted-foreground block min-h-4">
                    {form.custody_image ? form.custody_image.name : custodyImagePreview ? "صورة محفوظة مسبقاً" : "لم يتم إرفاق صورة"}
                  </span>
                  {custodyImagePreview && (
                    <div className="rounded-lg overflow-hidden border border-border h-28">
                      <img src={custodyImagePreview} alt="صورة العهدة" className="w-full h-full object-cover" />
                    </div>
                  )}
                  <Button type="button" variant="outline" size="sm" className="w-full gap-1.5 text-xs" onClick={() => handleImageSelect("custody")}>
                    <ImageIcon className="w-3.5 h-3.5" />
                    اختيار صورة العهدة
                  </Button>
                  <input ref={custodyImageRef} type="file" accept="image/png,image/jpeg,image/jpg,image/webp" className="hidden" onChange={(e) => handleImageChange(e, "custody")} />
                </div>

                <div className="rounded-lg border border-border p-3 space-y-3 bg-background">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold">صورة الفاتورة</span>
                    {(form.invoice_image || invoiceImagePreview) && (
                      <button type="button" aria-label="إزالة صورة الفاتورة" onClick={() => { setForm((f) => ({ ...f, invoice_image: null })); setInvoiceImagePreview(null); setUploadedInvoiceImageUrl(null); }} className="text-red-400 hover:text-red-600 transition-colors">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <span className="text-[11px] text-muted-foreground block min-h-4">
                    {form.invoice_image ? form.invoice_image.name : invoiceImagePreview ? "صورة محفوظة مسبقاً" : "لم يتم إرفاق صورة"}
                  </span>
                  {invoiceImagePreview && (
                    <div className="rounded-lg overflow-hidden border border-border h-28">
                      <img src={invoiceImagePreview} alt="صورة الفاتورة" className="w-full h-full object-cover" />
                    </div>
                  )}
                  <Button type="button" variant="outline" size="sm" className="w-full gap-1.5 text-xs" onClick={() => handleImageSelect("invoice")}>
                    <Receipt className="w-3.5 h-3.5" />
                    اختيار صورة الفاتورة
                  </Button>
                  <input ref={invoiceImageRef} type="file" accept="image/png,image/jpeg,image/jpg,image/webp" className="hidden" onChange={(e) => handleImageChange(e, "invoice")} />
                </div>
              </div>
            </section>
          </div>

          <div className="border-t border-border bg-background px-6 py-4">
            {editingItem ? (
              <Button className="w-full gap-2" onClick={handleUpdate} disabled={updateCustody.isPending || isUploading}>
                {(updateCustody.isPending || isUploading) ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                {isUploading ? "جاري رفع الصور..." : "حفظ التعديلات"}
              </Button>
            ) : (
              <Button className="w-full gap-2" onClick={handleSave} disabled={createCustody.isPending || isUploading}>
                {(createCustody.isPending || isUploading) ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                {isUploading ? "جاري رفع الصور..." : "حفظ كمسودة"}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <InventoryApprovalDialog open={!!approvalCandidate} name={approvalCandidate?.name || ""} pending={approveDraft.isPending} onCancel={() => setApprovalCandidate(null)} onConfirm={confirmApproval} />
    </DashboardLayout>
  );
}

function InfoField({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <span className="text-[11px] font-bold text-muted-foreground block mb-0.5">{label}</span>
      <span className={`text-sm ${highlight ? "font-mono font-bold text-primary" : "text-foreground"}`}>{value}</span>
    </div>
  );
}

function FormField({ label, placeholder, type = "text", value, onChange, required }: {
  label: string; placeholder?: string; type?: string; value: string; onChange: (v: string) => void; required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-bold text-foreground">
        {label}
        {required && <span className="text-red-500 mr-0.5">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-10 px-3 rounded-lg bg-muted/40 border border-border text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
      />
    </div>
  );
}
