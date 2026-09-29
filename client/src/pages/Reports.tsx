/**
 * Reports.tsx - التقارير
 * مربوط بالـ API الحقيقي عبر tRPC
 * مطابق لـ reports_ui.py الأصلي
 */
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import {
  Box, FileSpreadsheet, Filter, HandCoins, Loader2, Printer, RotateCcw, Search,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ReportsExcelButton } from "@/components/ExcelButtons";

function formatNumber(val: number): string {
  if (!val || isNaN(val)) return "0.00";
  return val.toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatCurrency(val: number): string {
  if (!val || isNaN(val)) return "0.00 ريال";
  return val.toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ريال";
}

export default function Reports() {
  const [codeFilter, setCodeFilter] = useState("");
  const [nameFilter, setNameFilter] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState("الكل");
  const [deptFilter, setDeptFilter] = useState("الكل");
  const [locFilter, setLocFilter] = useState("الكل");
  const [conditionFilter, setConditionFilter] = useState("الكل");
  const [typeFilter, setTypeFilter] = useState("الكل (أصول وعهد)");

  const [showTotalColumn, setShowTotalColumn] = useState(true);
  const [showUnitValue, setShowUnitValue] = useState(true);
  const [showTotalRow, setShowTotalRow] = useState(true);

  // جلب البيانات من API
  const reportType = typeFilter === "أصول فقط" ? "assets" as const : typeFilter === "عهَد فقط" ? "custody" as const : "all" as const;
  const { data: rawData, isLoading } = trpc.records.reports.inventory.useQuery({ type: reportType });
  const { data: deptsList } = trpc.settings.departments.list.useQuery();
  const { data: locsList } = trpc.settings.locations.list.useQuery();

  // بناء البيانات الموحدة
  const allData = useMemo(() => {
    if (!rawData) return [];
    return rawData.map((r: any) => ({
      report_type: r.type === "asset" ? "أصل" : "عهدة",
      code: r.code || "",
      name: r.name || "",
      quantity: r.quantity || 0,
      asset_value: parseFloat(r.unitValue) || 0,
      total_value: (r.quantity || 0) * (parseFloat(r.unitValue) || 0),
      owner_name: r.employeeName || "-",
      department: r.departmentName || "-",
      location: r.locationName || "-",
      condition: r.status || "جيد",
      notes: r.notes || "",
    }));
  }, [rawData]);

  // تطبيق الفلاتر
  const filteredData = useMemo(() => {
    return allData.filter((row: any) => {
      if (codeFilter && !row.code.toLowerCase().includes(codeFilter.toLowerCase())) return false;
      if (nameFilter && !row.name.toLowerCase().includes(nameFilter.toLowerCase())) return false;
      if (employeeFilter !== "الكل" && row.owner_name !== employeeFilter) return false;
      if (deptFilter !== "الكل" && row.department !== deptFilter) return false;
      if (locFilter !== "الكل" && row.location !== locFilter) return false;
      if (conditionFilter !== "الكل" && row.condition !== conditionFilter) return false;
      return true;
    });
  }, [allData, codeFilter, nameFilter, employeeFilter, deptFilter, locFilter, conditionFilter]);

  const stats = useMemo(() => {
    let totalAssets = 0;
    let totalCustody = 0;
    filteredData.forEach((row: any) => {
      if (row.report_type === "أصل") totalAssets += row.total_value;
      else totalCustody += row.total_value;
    });
    return { count: filteredData.length, totalAssets, totalCustody, totalOverall: totalAssets + totalCustody };
  }, [filteredData]);

  const activeFilters = useMemo(() => {
    const filters: string[] = [];
    if (codeFilter) filters.push(`الرمز: ${codeFilter}`);
    if (nameFilter) filters.push(`الاسم: ${nameFilter}`);
    if (employeeFilter !== "الكل") filters.push(`الموظف: ${employeeFilter}`);
    if (deptFilter !== "الكل") filters.push(`القسم: ${deptFilter}`);
    if (locFilter !== "الكل") filters.push(`الموقع: ${locFilter}`);
    if (conditionFilter !== "الكل") filters.push(`الحالة: ${conditionFilter}`);
    if (typeFilter !== "الكل (أصول وعهد)") filters.push(`النوع: ${typeFilter}`);
    return filters;
  }, [codeFilter, nameFilter, employeeFilter, deptFilter, locFilter, conditionFilter, typeFilter]);

  const resetFilters = () => {
    setCodeFilter(""); setNameFilter(""); setEmployeeFilter("الكل");
    setDeptFilter("الكل"); setLocFilter("الكل"); setConditionFilter("الكل");
    setTypeFilter("الكل (أصول وعهد)");
  };

  const uniqueEmployees = useMemo(() => {
    const names = new Set(allData.map((r: any) => r.owner_name).filter((n: string) => n && n !== "-"));
    return Array.from(names).sort();
  }, [allData]);

  const handlePrintPreview = () => {
    if (filteredData.length === 0) { toast.warning("لا توجد بيانات للطباعة"); return; }
    const filterText = activeFilters.length > 0 ? "بيانات التقرير: " + activeFilters.join(" | ") : "بيانات التقرير: (جميع البيانات)";
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const tableRows = filteredData.map((row: any, i: number) => `
      <tr>
        <td>${i + 1}</td>
        <td><span class="type-badge ${row.report_type === 'أصل' ? 'type-asset' : 'type-custody'}">${row.report_type}</span></td>
        <td class="code-cell">${row.code}</td>
        <td>${row.name}</td>
        <td class="num-cell">${row.quantity}</td>
        ${showUnitValue ? `<td class="num-cell">${formatNumber(row.asset_value)}</td>` : ""}
        ${showTotalColumn ? `<td class="num-cell total-cell">${formatNumber(row.total_value)}</td>` : ""}
        <td>${row.owner_name}</td>
        <td>${row.department}</td>
        <td>${row.location}</td>
        <td>${row.condition}</td>
        <td class="notes-cell">${row.notes}</td>
      </tr>
    `).join("");

    const totalRowHtml = showTotalRow ? `
      <tr class="total-row">
        <td colspan="${showUnitValue && showTotalColumn ? 6 : showUnitValue || showTotalColumn ? 5 : 4}" style="text-align:left;font-weight:700;">الإجمالي الكلي</td>
        <td class="num-cell total-cell" style="font-weight:700;">${formatNumber(stats.totalOverall)}</td>
        <td colspan="5"></td>
      </tr>
    ` : "";

    const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>تقرير العهد والأصول</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700&display=swap');
      @page { margin: 0.8cm; size: landscape; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Tajawal', sans-serif; margin: 12px; font-size: 11px; color: #1e293b; background: #fff; }
      .header { text-align: center; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 3px solid #0d9488; }
      .header h1 { color: #0d9488; font-size: 22px; font-weight: 700; margin-bottom: 4px; }
      .header .subtitle { color: #64748b; font-size: 12px; }
      .filter-info { background: #f0fdfa; border: 1px solid #99f6e4; border-radius: 8px; padding: 8px 12px; margin-bottom: 12px; font-size: 10px; color: #0f766e; }
      table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 9px; }
      th { background: #0d9488; color: white; padding: 7px 6px; text-align: right; border: 1px solid #0d9488; font-weight: 600; }
      td { padding: 5px 6px; border: 1px solid #e2e8f0; text-align: right; }
      tr:nth-child(even) { background: #f8fafc; }
      .num-cell { text-align: center; font-family: monospace; }
      .total-cell { font-weight: 600; color: #0f766e; }
      .code-cell { font-family: monospace; font-weight: 600; color: #0d9488; }
      .notes-cell { font-size: 8px; color: #64748b; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .type-badge { display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 8px; font-weight: 600; }
      .type-asset { background: #dbeafe; color: #1e40af; }
      .type-custody { background: #fef3c7; color: #92400e; }
      .total-row { background: #ecfdf5 !important; }
      .total-row td { font-weight: 700; color: #065f46; border-top: 2px solid #0d9488; }
      .stats-section { margin-top: 16px; padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; }
      .stats-grid { display: flex; justify-content: center; gap: 16px; flex-wrap: wrap; }
      .stat-card { background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 20px; text-align: center; }
      .stat-card .label { font-size: 9px; color: #64748b; margin-bottom: 4px; }
      .stat-card .value { font-size: 14px; font-weight: 700; color: #0d9488; }
      .stat-card.total { border-color: #0d9488; background: #f0fdfa; }
      .stat-card.total .value { color: #065f46; }
      .footer { display: flex; justify-content: space-between; margin-top: 16px; padding-top: 8px; border-top: 1px solid #e2e8f0; font-size: 9px; color: #94a3b8; }
      .no-print { text-align: center; margin-top: 16px; }
      .no-print button { background: #0d9488; color: white; border: none; padding: 10px 24px; font-size: 14px; cursor: pointer; border-radius: 8px; font-family: 'Tajawal', sans-serif; font-weight: 600; }
      @media print { .no-print { display: none; } }
    </style></head><body>
    <div class="header"><h1>تقرير العهد والأصول</h1><div class="subtitle">نظام إدارة العهد والأصول</div></div>
    <div class="filter-info">${filterText}</div>
    <table><thead><tr><th>م</th><th>النوع</th><th>الرمز</th><th>الاسم</th><th>الكمية</th>
    ${showUnitValue ? "<th>قيمة الوحدة</th>" : ""}${showTotalColumn ? "<th>إجمالي القيمة</th>" : ""}
    <th>الموظف/المسؤول</th><th>القسم</th><th>الموقع</th><th>الحالة</th><th>ملاحظات</th></tr></thead>
    <tbody>${tableRows}${totalRowHtml}</tbody></table>
    <div class="stats-section"><div class="stats-grid">
      <div class="stat-card"><div class="label">عدد العناصر</div><div class="value">${stats.count}</div></div>
      <div class="stat-card"><div class="label">إجمالي الأصول</div><div class="value">${formatCurrency(stats.totalAssets)}</div></div>
      <div class="stat-card"><div class="label">إجمالي العهد</div><div class="value">${formatCurrency(stats.totalCustody)}</div></div>
      <div class="stat-card total"><div class="label">الإجمالي الكلي</div><div class="value">${formatCurrency(stats.totalOverall)}</div></div>
    </div></div>
    <div class="footer"><div>التاريخ والوقت: ${new Date().toLocaleString("ar-SA")}</div><div>نظام إدارة العهد والأصول</div></div>
    <div class="no-print"><button onclick="window.print()">طباعة التقرير</button></div>
    </body></html>`;
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const handleExportExcel = () => {
    if (filteredData.length === 0) { toast.warning("لا توجد بيانات للتصدير"); return; }
    toast.success(`تم تصدير ${filteredData.length} عنصر إلى Excel`);
  };

  return (
    <DashboardLayout title="التقارير" subtitle="تقرير شامل للعهد والأصول">
      <div className="space-y-4">
        {/* قسم الفلاتر */}
        <div className="bg-card rounded-xl border border-border p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-foreground">فلاتر البحث</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-muted-foreground">رمز الأصل/العهدة</label>
              <div className="relative">
                <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
                <input value={codeFilter} onChange={(e) => setCodeFilter(e.target.value)} placeholder="بحث بالرمز..."
                  className="w-full h-9 pr-8 pl-3 rounded-lg bg-muted/40 border border-border text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all" />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-muted-foreground">اسم الأصل/العهدة</label>
              <div className="relative">
                <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
                <input value={nameFilter} onChange={(e) => setNameFilter(e.target.value)} placeholder="بحث بالاسم..."
                  className="w-full h-9 pr-8 pl-3 rounded-lg bg-muted/40 border border-border text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all" />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-muted-foreground">الموظف</label>
              <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="الكل">الكل</SelectItem>
                  {uniqueEmployees.map((e: any) => (<SelectItem key={e} value={e}>{e}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-muted-foreground">القسم</label>
              <Select value={deptFilter} onValueChange={setDeptFilter}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="الكل">الكل</SelectItem>
                  {(deptsList || []).map((d: any) => (<SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-muted-foreground">الموقع</label>
              <Select value={locFilter} onValueChange={setLocFilter}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="الكل">الكل</SelectItem>
                  {(locsList || []).map((l: any) => (<SelectItem key={l.id} value={l.name}>{l.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-muted-foreground">الحالة</label>
              <Select value={conditionFilter} onValueChange={setConditionFilter}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="الكل">الكل</SelectItem>
                  <SelectItem value="ACTIVE">نشط</SelectItem>
                  <SelectItem value="EXCLUDED">مستبعد</SelectItem>
                  <SelectItem value="TRANSFERRED">منقول</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-muted-foreground">نوع التقرير</label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="الكل (أصول وعهد)">الكل (أصول وعهد)</SelectItem>
                  <SelectItem value="أصول فقط">أصول فقط</SelectItem>
                  <SelectItem value="عهَد فقط">عهَد فقط</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between flex-wrap gap-3 pt-3 border-t border-border/50">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                <input type="checkbox" checked={showTotalColumn} onChange={(e) => setShowTotalColumn(e.target.checked)} className="rounded border-border accent-primary w-3.5 h-3.5" />
                إظهار الإجمالي بالصف
              </label>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                <input type="checkbox" checked={showUnitValue} onChange={(e) => setShowUnitValue(e.target.checked)} className="rounded border-border accent-primary w-3.5 h-3.5" />
                إظهار قيمة الوحدة
              </label>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                <input type="checkbox" checked={showTotalRow} onChange={(e) => setShowTotalRow(e.target.checked)} className="rounded border-border accent-primary w-3.5 h-3.5" />
                إظهار صف الإجمالي
              </label>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={resetFilters}>
                <RotateCcw className="w-3 h-3" /> تصفير الفلاتر
              </Button>
            </div>
          </div>
        </div>

        {/* شريط الفلاتر النشطة */}
        {activeFilters.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-bold text-muted-foreground">الفلاتر النشطة:</span>
            {activeFilters.map((f, i) => (
              <span key={i} className="inline-flex items-center gap-1 text-[10px] bg-primary/10 text-primary font-medium px-2.5 py-1 rounded-full">{f}</span>
            ))}
            <button onClick={resetFilters} className="text-[10px] text-red-500 hover:text-red-700 underline">مسح الكل</button>
          </div>
        )}

        {/* الجدول الرئيسي */}
        <div className="bg-card rounded-xl border border-border shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gradient-to-l from-primary/5 to-primary/10 border-b border-border">
                  <th className="text-right text-[11px] font-bold text-primary px-3 py-2.5 w-10">م</th>
                  <th className="text-right text-[11px] font-bold text-primary px-3 py-2.5 w-16">النوع</th>
                  <th className="text-right text-[11px] font-bold text-primary px-3 py-2.5 w-24">الرمز</th>
                  <th className="text-right text-[11px] font-bold text-primary px-3 py-2.5">الاسم</th>
                  <th className="text-center text-[11px] font-bold text-primary px-3 py-2.5 w-16">الكمية</th>
                  {showUnitValue && <th className="text-center text-[11px] font-bold text-primary px-3 py-2.5 w-24">قيمة الوحدة</th>}
                  {showTotalColumn && <th className="text-center text-[11px] font-bold text-primary px-3 py-2.5 w-28">إجمالي القيمة</th>}
                  <th className="text-right text-[11px] font-bold text-primary px-3 py-2.5">الموظف/المسؤول</th>
                  <th className="text-right text-[11px] font-bold text-primary px-3 py-2.5">القسم</th>
                  <th className="text-right text-[11px] font-bold text-primary px-3 py-2.5">الموقع</th>
                  <th className="text-right text-[11px] font-bold text-primary px-3 py-2.5 w-20">الحالة</th>
                  <th className="text-right text-[11px] font-bold text-primary px-3 py-2.5">ملاحظات</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={12} className="text-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">جاري تحميل البيانات...</p>
                  </td></tr>
                ) : filteredData.length === 0 ? (
                  <tr><td colSpan={12} className="text-center py-12 text-muted-foreground text-sm">لا توجد بيانات مطابقة للفلاتر المحددة</td></tr>
                ) : (
                  <>
                    {filteredData.map((row: any, index: number) => (
                      <tr key={`${row.code}-${index}`} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <td className="px-3 py-2 text-xs text-muted-foreground">{index + 1}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            row.report_type === "أصل" ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700"
                          }`}>
                            {row.report_type === "أصل" ? <Box className="w-2.5 h-2.5" /> : <HandCoins className="w-2.5 h-2.5" />}
                            {row.report_type}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs font-bold text-primary">{row.code}</td>
                        <td className="px-3 py-2 text-xs font-medium">{row.name}</td>
                        <td className="px-3 py-2 text-center text-xs">{row.quantity}</td>
                        {showUnitValue && <td className="px-3 py-2 text-center text-xs font-mono">{formatNumber(row.asset_value)}</td>}
                        {showTotalColumn && <td className="px-3 py-2 text-center text-xs font-mono font-bold text-emerald-700">{formatNumber(row.total_value)}</td>}
                        <td className="px-3 py-2 text-xs">{row.owner_name}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{row.department}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{row.location}</td>
                        <td className="px-3 py-2">
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                            row.condition === "ACTIVE" ? "bg-emerald-50 text-emerald-700" :
                            row.condition === "EXCLUDED" ? "bg-red-50 text-red-700" :
                            "bg-blue-50 text-blue-700"
                          }`}>{row.condition === "ACTIVE" ? "نشط" : row.condition === "EXCLUDED" ? "مستبعد" : row.condition === "TRANSFERRED" ? "منقول" : row.condition}</span>
                        </td>
                        <td className="px-3 py-2 text-[10px] text-muted-foreground max-w-[120px] truncate">{row.notes || "-"}</td>
                      </tr>
                    ))}
                    {showTotalRow && filteredData.length > 0 && (
                      <tr className="bg-emerald-50/80 border-t-2 border-primary/30">
                        <td colSpan={showUnitValue && showTotalColumn ? 6 : showUnitValue || showTotalColumn ? 5 : 4} className="px-3 py-2.5 text-xs font-bold text-emerald-800 text-left">الإجمالي الكلي</td>
                        {showTotalColumn && <td className="px-3 py-2.5 text-center text-xs font-mono font-bold text-emerald-800">{formatNumber(stats.totalOverall)}</td>}
                        <td colSpan={5} />
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* شريط الإحصائيات */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-card rounded-xl border border-border p-3 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <p className="text-[10px] text-muted-foreground mb-1">عدد العناصر</p>
            <p className="text-lg font-bold text-foreground">{stats.count}</p>
          </div>
          {(typeFilter === "الكل (أصول وعهد)" || typeFilter === "أصول فقط") && (
            <div className="bg-card rounded-xl border border-blue-200 p-3 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <p className="text-[10px] text-blue-600 mb-1">إجمالي الأصول</p>
              <p className="text-sm font-bold text-blue-700">{formatCurrency(stats.totalAssets)}</p>
            </div>
          )}
          {(typeFilter === "الكل (أصول وعهد)" || typeFilter === "عهَد فقط") && (
            <div className="bg-card rounded-xl border border-amber-200 p-3 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <p className="text-[10px] text-amber-600 mb-1">إجمالي العهد</p>
              <p className="text-sm font-bold text-amber-700">{formatCurrency(stats.totalCustody)}</p>
            </div>
          )}
          <div className="bg-card rounded-xl border border-emerald-200 p-3 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <p className="text-[10px] text-emerald-600 mb-1">الإجمالي الكلي</p>
            <p className="text-sm font-bold text-emerald-700">{formatCurrency(stats.totalOverall)}</p>
          </div>
        </div>

        {/* أزرار الإجراءات */}
        <div className="flex items-center justify-between bg-card rounded-xl border border-border p-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-foreground bg-muted/60 px-3 py-1.5 rounded-lg">{stats.count} عنصر</span>
          </div>
          <div className="flex items-center gap-2">
            <ReportsExcelButton />
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={handlePrintPreview}>
              <Printer className="w-3.5 h-3.5" /> معاينة الطباعة
            </Button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
