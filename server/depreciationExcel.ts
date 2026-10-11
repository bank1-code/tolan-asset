import * as XLSX from "xlsx";
import { jsonData } from "./depreciationStore";
import { financialExcelCell } from "../shared/depreciation";
export function financialExcel(journals: any[], title: string) {
  // Excel retains only 15 significant digits. Preserve larger amounts as exact text.
  const cellMoney = financialExcelCell;
  const wb = XLSX.utils.book_new();
  const corrections: any[][] = [
    [title],
    ["التصحيحات المعتمدة؛ القيم قبل وبعد لكل وحدة"],
    [
      "رقم القيد",
      "التاريخ",
      "الدفعة",
      "الوحدة",
      "التكلفة قبل",
      "التكلفة بعد",
      "المجمع قبل",
      "المجمع بعد",
      "انخفاض القيمة قبل",
      "انخفاض القيمة بعد",
    ],
  ];
  const data: any[][] = [
    [title],
    [
      "قيود معتمدة داخل الوحدة؛ التصدير لا يثبت الترحيل في البرنامج المحاسبي الخارجي",
    ],
    [
      "رقم القيد",
      "التاريخ",
      "العملة",
      "نوع الحركة",
      "الحساب",
      "التصنيف",
      "مركز التكلفة",
      "مدين",
      "دائن",
      "البيان",
    ],
  ];
  const details: any[][] = [
    [title],
    ["تفاصيل الوحدات ومصادر القيود"],
    [
      "رقم القيد",
      "تاريخ القيد",
      "نوع السجل",
      "معرف السجل",
      "رمز السجل",
      "الاسم",
      "التصنيف",
      "الدفعة",
      "الوحدة",
      "الموقع",
      "الفرع",
      "القسم",
      "مركز التكلفة",
      "من",
      "إلى",
      "مصروف الإهلاك",
    ],
  ];
  for (const j of journals) {
    const snapshot = jsonData(j.snapshot);
    for (const l of snapshot.lines)
      data.push([
        j.code,
        j.effectiveDate,
        snapshot.currency,
        j.kind,
        l.account,
        l.classification,
        l.costCenter,
        cellMoney(l.debit),
        cellMoney(l.credit),
        l.narration,
      ]);
    if (Array.isArray(snapshot.details))
      for (const l of snapshot.details) {
        if (l.before && l.after)
          corrections.push([
            j.code,
            j.effectiveDate,
            l.batchId,
            l.unit,
            cellMoney(l.before.cost),
            cellMoney(l.after.cost),
            cellMoney(l.before.accumulated),
            cellMoney(l.after.accumulated),
            cellMoney(l.before.impairment),
            cellMoney(l.after.impairment),
          ]);
        details.push([
          j.code,
          j.effectiveDate,
          l.entityType,
          l.entityId,
          l.code,
          l.name,
          l.classification,
          l.batchId,
          l.unit,
          l.allocation?.location ?? "",
          l.allocation?.branch ?? "",
          l.allocation?.department ?? "",
          l.allocation?.costCenter ?? "",
          l.from,
          l.to,
          l.debit === undefined
            ? ""
            : j.kind === "REVERSAL"
              ? -Number(l.debit)
              : Number(l.debit),
        ]);
      }
    else if (snapshot.details?.batch)
      for (const unit of snapshot.details.units)
        details.push([
          j.code,
          j.effectiveDate,
          snapshot.details.batch.entityType,
          snapshot.details.batch.entityId,
          snapshot.details.batch.identity.code,
          snapshot.details.batch.identity.name,
          snapshot.details.batch.identity.classification,
          snapshot.details.batch.id,
          unit.unit,
          unit.allocation.location,
          unit.allocation.branch,
          unit.allocation.department,
          unit.allocation.costCenter,
          "",
          "",
          "",
        ]);
  }
  for (const [name, rows] of [
    ["القيود", data],
    ["التفاصيل", details],
  ] as const) {
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet["!cols"] = rows[2].map(() => ({ wch: 22 }));
    sheet["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: rows[2].length - 1 } },
    ];
    for (const key of Object.keys(sheet))
      if (!key.startsWith("!") && sheet[key].t === "n")
        sheet[key].z = "#,##0.00";
    XLSX.utils.book_append_sheet(wb, sheet, name);
  }
  wb.Workbook = { Views: [{ RTL: true }] };
  if (corrections.length > 3) {
    const sheet = XLSX.utils.aoa_to_sheet(corrections);
    sheet["!cols"] = corrections[2].map(() => ({ wch: 24 }));
    XLSX.utils.book_append_sheet(wb, sheet, "تفاصيل التصحيحات");
  }
  return XLSX.write(wb, { type: "base64", bookType: "xlsx" });
}
