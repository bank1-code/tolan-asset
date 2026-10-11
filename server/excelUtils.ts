import * as XLSX from "xlsx";
// Helper: Convert DB rows to Excel buffer
export function createExcelBuffer(
  data: Record<string, unknown>[],
  headers: { key: string; label: string; numeric?: boolean }[],
  sheetName: string
): string {
  const wb = XLSX.utils.book_new();

  // Create header row + data rows
  const wsData = [
    headers.map(h => h.label),
    ...data.map(row =>
      headers.map(h => {
        const val = row[h.key];
        if (val === null || val === undefined) return "";
        if (val instanceof Date) return val.toISOString().split("T")[0];
        // Only explicitly numeric columns are converted; identifiers retain zeros.
        // Excel preserves 15 significant digits. Larger values remain exact text.
        if (h.numeric && /^-?\d+(\.\d+)?$/.test(String(val))) {
          const digits = String(val).replace(/^-?0*/, "").replace(".", "");
          if (digits.length <= 15 && Number.isFinite(Number(val))) return Number(val);
        }
        return String(val);
      })
    ),
  ];

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Set RTL for Arabic
  ws["!dir"] = "rtl";

  // Set column widths
  ws["!cols"] = headers.map(h => ({ wch: Math.max(h.label.length * 2, 15) }));

  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const buffer = XLSX.write(wb, { type: "base64", bookType: "xlsx" });
  return buffer;
}
