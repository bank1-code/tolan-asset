import { periodTitle } from "@shared/depreciation";
const escape = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!
  );
export function financialPrintHtml(
  report: any,
  view: string,
  columns: string[][]
): string {
  const names: Record<string, string> = {
    summary: "إجمالي الأصول ومجمع الإهلاك حسب التصنيف",
    register: "السجل المالي للأصول والعهد",
    expense: "مصروف الإهلاك حسب التخصيص",
    fully: "الأصول المستهلكة بالكامل التي لا تزال في الخدمة",
    exceptions: "نواقص الإهلاك وحالة الفترات",
  };
  const title =
    view === "comparison"
      ? report.title
      : periodTitle(names[view] ?? names.summary, report.from, report.to);
  const rows = ["summary", "comparison"].includes(view)
    ? report.groups
    : view === "expense"
      ? report.expenses
      : view === "exceptions"
        ? report.periodStatus
        : report.rows.filter(
            (r: any) => view !== "fully" || r.fullyDepreciated
          );
  const tableColumns =
    view === "expense"
      ? [
          ["classification", "التصنيف"],
          ["costCenter", "مركز التكلفة"],
          ["location", "الموقع"],
          ["branch", "الفرع"],
          ["department", "القسم"],
          ["value", "مصروف الإهلاك"],
        ]
      : view === "exceptions"
        ? [
            ["month", "الشهر"],
            ["status", "الحالة"],
            ["total", "المصروف"],
          ]
        : ["summary", "comparison"].includes(view)
          ? columns
          : [
              ["code", "الرمز"],
              ["name", "الاسم"],
              ["unit", "الوحدة"],
              ...columns,
            ];
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${escape(title)}</title><style>@page{size:A3 landscape;margin:12mm}body{font-family:Tahoma,Arial,sans-serif;color:#17232c;padding:20px}h1{font-size:19px}p{font-size:12px}table{border-collapse:collapse;width:100%;font-size:10px}th,td{border:1px solid #b7c5cd;padding:7px;text-align:right}th{background:#edf3f5}thead{display:table-header-group}tr{break-inside:avoid}.tools{margin-bottom:20px}.warning{color:#8a4900}@media print{.tools{display:none}body{padding:0}}</style></head><body><div class="tools"><button onclick="window.print()">طباعة / حفظ PDF</button></div><h1>${escape(title)}</h1><p>${escape(report.organizationName)} — العملة: ${escape(report.currency)}</p><p>${escape(report.basis)}</p>${report.pendingMonths?.length ? `<p class="warning">فترات لم تعتمد: ${escape(report.pendingMonths.join("، "))}</p>` : ""}<table><thead><tr>${tableColumns.map(([, label]) => `<th>${escape(label)}</th>`).join("")}</tr></thead><tbody>${rows.map((row: any) => `<tr>${tableColumns.map(([key]) => `<td>${escape(row[key])}</td>`).join("")}</tr>`).join("")}</tbody></table><p>أُعد التقرير في ${escape(new Date().toLocaleString("ar-SA"))}. الحركات المعتمدة داخل الوحدة؛ لا تمثل تأكيد ترحيل خارجي.</p></body></html>`;
}
export function openFinancialPrint(
  report: any,
  view: string,
  columns: string[][]
) {
  const html = financialPrintHtml(report, view, columns),
    url = URL.createObjectURL(
      new Blob([html], { type: "text/html;charset=utf-8" })
    );
  const opened = window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return !!opened;
}
