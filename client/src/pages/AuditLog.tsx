import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { AuditLogExcelButton } from "@/components/ExcelButtons";
import { useAuditLog, useAuditStats } from "../lib/api";
import {
  Search,
  Filter,
  Shield,
  Activity,
  Clock,
  User,
  Database,
  FileText,
  ChevronLeft,
  ChevronRight,
  Eye,
  X,
  RefreshCw,
  ArrowLeftRight,
  Download,
  Printer,
} from "lucide-react";

const actionTypeLabels: Record<string, { label: string; color: string; bgColor: string; icon: string }> = {
  CREATE: { label: "إضافة", color: "text-emerald-700", bgColor: "bg-emerald-100", icon: "+" },
  UPDATE: { label: "تعديل", color: "text-blue-700", bgColor: "bg-blue-100", icon: "✎" },
  DELETE: { label: "حذف", color: "text-red-700", bgColor: "bg-red-100", icon: "✕" },
  TRANSFER: { label: "نقل", color: "text-purple-700", bgColor: "bg-purple-100", icon: "↔" },
  EXCLUDE: { label: "استبعاد", color: "text-amber-700", bgColor: "bg-amber-100", icon: "⊘" },
  CLEARANCE: { label: "براءة ذمة", color: "text-cyan-700", bgColor: "bg-cyan-100", icon: "✓" },
};

const tableNameLabels: Record<string, string> = {
  departments: "الأقسام",
  locations: "المواقع",
  employees: "الموظفين",
  exclusion_types: "أنواع الاستبعاد",
  assets: "الأصول",
  custody_items: "العهد",
  asset_transfers: "النقل",
  asset_exclusions: "استبعاد الأصول",
  custody_exclusions: "استبعاد العهد",
  clearance_records: "براءة الذمة",
  archive_documents: "الأرشيف",
};

// ترجمة أسماء الحقول للعربية
const fieldNameLabels: Record<string, string> = {
  assetName: "اسم الأصل",
  assetCode: "رمز الأصل",
  name: "الاسم",
  code: "الرمز",
  quantity: "الكمية",
  assetValue: "القيمة",
  condition: "الحالة الفنية",
  assignedTo: "المستلم",
  departmentId: "القسم",
  locationId: "الموقع",
  status: "الحالة",
  notes: "الملاحظات",
  fullName: "الاسم الكامل",
  fingerprintId: "رقم البصمة",
  nationalId: "رقم الهوية",
  phone: "الهاتف",
  assetImagePath: "صورة الأصل",
  invoiceImagePath: "صورة الفاتورة",
};

function getFieldLabel(field: string): string {
  return fieldNameLabels[field] || field;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "نعم" : "لا";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

// مكون عرض التغييرات بصرياً
function ChangesViewer({ oldData, newData, changedFields }: { oldData: any; newData: any; changedFields?: string[] }) {
  if (!oldData && !newData) return null;

  const old = typeof oldData === "string" ? JSON.parse(oldData) : oldData;
  const nw = typeof newData === "string" ? JSON.parse(newData) : newData;

  // إذا كانت هناك حقول متغيرة محددة - عرض مقارنة بصرية
  if (changedFields && changedFields.length > 0 && old && nw) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 mb-3">
          <ArrowLeftRight className="w-4 h-4 text-blue-500" />
          <span className="text-sm font-medium text-blue-700">التغييرات ({changedFields.length} حقل)</span>
        </div>
        <div className="border border-blue-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-blue-50">
                <th className="px-3 py-2 text-right text-xs font-semibold text-blue-600 border-b border-blue-200 w-1/4">الحقل</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-red-600 border-b border-blue-200 w-[37.5%]">القيمة القديمة</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-emerald-600 border-b border-blue-200 w-[37.5%]">القيمة الجديدة</th>
              </tr>
            </thead>
            <tbody>
              {changedFields.map((field, i) => (
                <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  <td className="px-3 py-2 font-medium text-gray-700 text-xs border-l border-gray-100">
                    {getFieldLabel(field)}
                  </td>
                  <td className="px-3 py-2 border-l border-gray-100">
                    <span className="inline-block px-2 py-0.5 bg-red-50 text-red-700 rounded text-xs line-through">
                      {formatValue(old[field])}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-block px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded text-xs font-medium">
                      {formatValue(nw[field])}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // عرض البيانات القديمة والجديدة كـ JSON
  return (
    <div className="space-y-3">
      {old && (
        <div className="bg-red-50 rounded-lg p-3 border border-red-200">
          <p className="text-xs font-semibold text-red-600 mb-2 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-500"></span>
            البيانات القديمة
          </p>
          <div className="bg-white rounded p-2 border border-red-100">
            <pre className="text-xs text-red-700 overflow-auto max-h-32 whitespace-pre-wrap font-mono" dir="ltr">
              {JSON.stringify(old, null, 2)}
            </pre>
          </div>
        </div>
      )}
      {nw && (
        <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-200">
          <p className="text-xs font-semibold text-emerald-600 mb-2 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            البيانات الجديدة
          </p>
          <div className="bg-white rounded p-2 border border-emerald-100">
            <pre className="text-xs text-emerald-700 overflow-auto max-h-32 whitespace-pre-wrap font-mono" dir="ltr">
              {JSON.stringify(nw, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AuditLog() {
  const [search, setSearch] = useState("");
  const [filterTable, setFilterTable] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(0);
  const [selectedRow, setSelectedRow] = useState<any>(null);
  const pageSize = 50;

  const filters = useMemo(() => ({
    search: search || undefined,
    tableName: filterTable || undefined,
    actionType: filterAction || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    limit: pageSize,
    offset: page * pageSize,
  }), [search, filterTable, filterAction, startDate, endDate, page]);

  const { data, isLoading, refetch } = useAuditLog(filters);
  const { data: stats } = useAuditStats();

  const rows = data?.rows || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / pageSize);

  const activeFilters = [
    search && "بحث",
    filterTable && tableNameLabels[filterTable],
    filterAction && actionTypeLabels[filterAction]?.label,
    startDate && "من تاريخ",
    endDate && "إلى تاريخ",
  ].filter(Boolean);

  const clearFilters = () => {
    setSearch("");
    setFilterTable("");
    setFilterAction("");
    setStartDate("");
    setEndDate("");
    setPage(0);
  };

  // طباعة سجل التدقيق
  const handlePrint = () => {
    const printContent = `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <title>سجل التدقيق</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, sans-serif; padding: 20px; direction: rtl; }
          h1 { text-align: center; color: #1e293b; margin-bottom: 5px; }
          .subtitle { text-align: center; color: #64748b; font-size: 14px; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          th { background: #f1f5f9; color: #334155; padding: 10px 8px; text-align: right; font-size: 12px; border: 1px solid #e2e8f0; }
          td { padding: 8px; text-align: right; font-size: 11px; border: 1px solid #e2e8f0; }
          tr:nth-child(even) { background: #f8fafc; }
          .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 600; }
          .badge-create { background: #d1fae5; color: #065f46; }
          .badge-update { background: #dbeafe; color: #1e40af; }
          .badge-delete { background: #fee2e2; color: #991b1b; }
          .badge-transfer { background: #ede9fe; color: #5b21b6; }
          .badge-exclude { background: #fef3c7; color: #92400e; }
          .badge-clearance { background: #cffafe; color: #155e75; }
          .footer { text-align: center; margin-top: 20px; color: #94a3b8; font-size: 11px; }
          @media print { button { display: none; } }
        </style>
      </head>
      <body>
        <h1>سجل التدقيق</h1>
        <p class="subtitle">تاريخ الطباعة: ${new Date().toLocaleString("ar-SA")} | عدد السجلات: ${rows.length}</p>
        ${activeFilters.length > 0 ? `<p class="subtitle">الفلاتر: ${activeFilters.join(" | ")}</p>` : ""}
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>التاريخ</th>
              <th>العملية</th>
              <th>الجدول</th>
              <th>الوصف</th>
              <th>المستخدم</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row: any, i: number) => {
              const actionClass = row.actionType?.toLowerCase() || "create";
              return `<tr>
                <td>${i + 1}</td>
                <td>${new Date(row.createdAt).toLocaleString("ar-SA")}</td>
                <td><span class="badge badge-${actionClass}">${actionTypeLabels[row.actionType]?.label || row.actionType}</span></td>
                <td>${tableNameLabels[row.tableName] || row.tableName}</td>
                <td>${row.actionDescription || ""}</td>
                <td>${row.performedByName || "النظام"}</td>
                <td style="font-family: monospace; font-size: 10px;">${row.ipAddress || "—"}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
        <div class="footer">نظام إدارة العهد والأصول - سجل التدقيق</div>
        <button onclick="window.print()" style="display:block;margin:20px auto;padding:10px 30px;background:#4f46e5;color:white;border:none;border-radius:8px;cursor:pointer;font-size:14px;">طباعة</button>
      </body>
      </html>
    `;
    const win = window.open("", "_blank");
    if (win) {
      win.document.write(printContent);
      win.document.close();
    }
  };

  return (
    <DashboardLayout title="سجل التدقيق" subtitle="تتبع جميع العمليات والتغييرات في النظام">
      <div className="flex flex-col h-full">
        {/* Header Actions */}
        <div className="px-6 pt-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-indigo-600" />
            <span className="text-sm font-medium text-gray-600">
              {total > 0 ? `${total} عملية مسجلة` : "لا توجد عمليات"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <AuditLogExcelButton />
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-3 py-2 bg-gray-50 text-gray-600 rounded-lg hover:bg-gray-100 transition-colors text-sm border border-gray-200"
            >
              <Printer className="w-4 h-4" />
              طباعة
            </button>
            <button
              onClick={() => refetch()}
              className="flex items-center gap-2 px-3 py-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors text-sm"
            >
              <RefreshCw className="w-4 h-4" />
              تحديث
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="px-6 py-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <div className="bg-white rounded-xl p-3 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-indigo-100 rounded-lg">
                <Activity className="w-4 h-4 text-indigo-600" />
              </div>
              <div>
                <p className="text-xl font-bold text-gray-800">{stats?.total || 0}</p>
                <p className="text-[10px] text-gray-500">إجمالي العمليات</p>
              </div>
            </div>
          </div>
          {Object.entries(actionTypeLabels).map(([key, val]) => {
            const count = stats?.byAction?.find((a: any) => a.actionType === key)?.count || 0;
            return (
              <div key={key} className="bg-white rounded-xl p-3 border border-gray-200 shadow-sm">
                <div className="flex items-center gap-2">
                  <div className={`p-2 rounded-lg ${val.bgColor}`}>
                    <span className={`text-sm font-bold ${val.color}`}>{val.icon}</span>
                  </div>
                  <div>
                    <p className="text-xl font-bold text-gray-800">{count}</p>
                    <p className="text-[10px] text-gray-500">{val.label}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Filters */}
        <div className="px-6 pb-3">
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="بحث في الوصف أو المستخدم..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                  className="w-full pr-10 pl-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <select
                value={filterTable}
                onChange={(e) => { setFilterTable(e.target.value); setPage(0); }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">جميع الجداول</option>
                {Object.entries(tableNameLabels).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
              <select
                value={filterAction}
                onChange={(e) => { setFilterAction(e.target.value); setPage(0); }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">جميع العمليات</option>
                {Object.entries(actionTypeLabels).map(([key, val]) => (
                  <option key={key} value={key}>{val.label}</option>
                ))}
              </select>
              <input
                type="date"
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); setPage(0); }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="من تاريخ"
              />
              <input
                type="date"
                value={endDate}
                onChange={(e) => { setEndDate(e.target.value); setPage(0); }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="إلى تاريخ"
              />
            </div>
            {activeFilters.length > 0 && (
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                <Filter className="w-4 h-4 text-gray-400" />
                <span className="text-xs text-gray-500">فلاتر نشطة:</span>
                {activeFilters.map((f, i) => (
                  <span key={i} className="px-2 py-1 bg-indigo-50 text-indigo-600 rounded text-xs">{f}</span>
                ))}
                <button onClick={clearFilters} className="text-xs text-red-500 hover:text-red-700 mr-2">
                  تصفير الكل
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 px-6 pb-4 overflow-hidden">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm h-full flex flex-col">
            <div className="overflow-auto flex-1">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-right font-semibold text-gray-600 border-b w-8">#</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-600 border-b">التاريخ</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-600 border-b">العملية</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-600 border-b">الجدول</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-600 border-b">الوصف</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-600 border-b">التغييرات</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-600 border-b">المستخدم</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-600 border-b">تفاصيل</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={8} className="text-center py-12 text-gray-400">
                        <div className="flex flex-col items-center gap-2">
                          <RefreshCw className="w-6 h-6 animate-spin" />
                          <span>جاري التحميل...</span>
                        </div>
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-12 text-gray-400">
                        <div className="flex flex-col items-center gap-2">
                          <FileText className="w-8 h-8" />
                          <span>لا توجد سجلات</span>
                          <span className="text-xs">ستظهر هنا جميع العمليات التي تتم على النظام</span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    rows.map((row: any, index: number) => {
                      const actionInfo = actionTypeLabels[row.actionType] || { label: row.actionType, color: "text-gray-700", bgColor: "bg-gray-100", icon: "•" };
                      const changedCount = row.changedFields?.length || 0;
                      return (
                        <tr key={row.id} className="hover:bg-gray-50 border-b border-gray-100 transition-colors">
                          <td className="px-4 py-3 text-xs text-gray-400">{page * pageSize + index + 1}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col">
                              <span className="text-gray-700 text-xs">
                                {new Date(row.createdAt).toLocaleDateString("ar-SA")}
                              </span>
                              <span className="text-gray-400 text-[10px]">
                                {new Date(row.createdAt).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${actionInfo.bgColor} ${actionInfo.color}`}>
                              <span>{actionInfo.icon}</span>
                              {actionInfo.label}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-gray-600 text-xs">{tableNameLabels[row.tableName] || row.tableName}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-gray-700 text-xs line-clamp-2">{row.actionDescription}</span>
                          </td>
                          <td className="px-4 py-3">
                            {changedCount > 0 ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-xs">
                                <ArrowLeftRight className="w-3 h-3" />
                                {changedCount} حقل
                              </span>
                            ) : row.actionType === "CREATE" ? (
                              <span className="text-emerald-500 text-xs">جديد</span>
                            ) : row.actionType === "DELETE" ? (
                              <span className="text-red-500 text-xs">محذوف</span>
                            ) : (
                              <span className="text-gray-400 text-xs">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center">
                                <User className="w-3 h-3 text-indigo-600" />
                              </div>
                              <span className="text-gray-600 text-xs">{row.performedByName || "النظام"}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => setSelectedRow(row)}
                              className="p-1.5 text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors"
                              title="عرض التفاصيل"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="border-t border-gray-200 px-4 py-3 flex items-center justify-between bg-gray-50">
              <span className="text-xs text-gray-500">
                عرض {rows.length} من {total} سجل
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="p-1.5 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <span className="text-xs text-gray-600">
                  صفحة {page + 1} من {Math.max(1, totalPages)}
                </span>
                <button
                  onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                  disabled={page >= totalPages - 1}
                  className="p-1.5 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Detail Modal */}
        {selectedRow && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedRow(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
              {/* Modal Header */}
              <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${actionTypeLabels[selectedRow.actionType]?.bgColor || "bg-gray-100"}`}>
                    <span className={`text-lg ${actionTypeLabels[selectedRow.actionType]?.color || "text-gray-700"}`}>
                      {actionTypeLabels[selectedRow.actionType]?.icon || "•"}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-800">تفاصيل العملية</h3>
                    <p className="text-xs text-gray-500">
                      {actionTypeLabels[selectedRow.actionType]?.label || selectedRow.actionType} - {tableNameLabels[selectedRow.tableName] || selectedRow.tableName}
                    </p>
                  </div>
                </div>
                <button onClick={() => setSelectedRow(null)} className="p-2 hover:bg-gray-100 rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-5">
                {/* معلومات أساسية */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                    <p className="text-[10px] text-gray-400 mb-1 uppercase tracking-wider">نوع العملية</p>
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${actionTypeLabels[selectedRow.actionType]?.bgColor || "bg-gray-100"} ${actionTypeLabels[selectedRow.actionType]?.color || "text-gray-700"}`}>
                      {actionTypeLabels[selectedRow.actionType]?.icon} {actionTypeLabels[selectedRow.actionType]?.label || selectedRow.actionType}
                    </span>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                    <p className="text-[10px] text-gray-400 mb-1 uppercase tracking-wider">الجدول</p>
                    <p className="text-sm font-medium text-gray-700">{tableNameLabels[selectedRow.tableName] || selectedRow.tableName}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                    <p className="text-[10px] text-gray-400 mb-1 uppercase tracking-wider">رقم السجل</p>
                    <p className="text-sm font-medium text-gray-700 font-mono">#{selectedRow.recordId || "—"}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                    <p className="text-[10px] text-gray-400 mb-1 uppercase tracking-wider">التاريخ والوقت</p>
                    <p className="text-sm font-medium text-gray-700">
                      {new Date(selectedRow.createdAt).toLocaleString("ar-SA")}
                    </p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                    <p className="text-[10px] text-gray-400 mb-1 uppercase tracking-wider">المستخدم</p>
                    <div className="flex items-center gap-1.5">
                      <div className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center">
                        <User className="w-3 h-3 text-indigo-600" />
                      </div>
                      <p className="text-sm font-medium text-gray-700">{selectedRow.performedByName || "النظام"}</p>
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                    <p className="text-[10px] text-gray-400 mb-1 uppercase tracking-wider">عنوان IP</p>
                    <p className="text-sm font-medium text-gray-700 font-mono">{selectedRow.ipAddress || "—"}</p>
                  </div>
                </div>

                {/* الوصف */}
                <div className="bg-indigo-50 rounded-lg p-4 border border-indigo-100">
                  <p className="text-[10px] text-indigo-400 mb-1 uppercase tracking-wider">وصف العملية</p>
                  <p className="text-sm text-indigo-800 font-medium">{selectedRow.actionDescription}</p>
                </div>

                {/* عرض التغييرات */}
                <ChangesViewer
                  oldData={selectedRow.oldData}
                  newData={selectedRow.newData}
                  changedFields={selectedRow.changedFields}
                />

                {/* User Agent */}
                {selectedRow.userAgent && (
                  <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                    <p className="text-[10px] text-gray-400 mb-1 uppercase tracking-wider">المتصفح</p>
                    <p className="text-xs text-gray-500 font-mono break-all">{selectedRow.userAgent}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
