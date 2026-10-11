import { describe, it, expect } from "vitest";
import { financialPrintHtml } from "../client/src/lib/depreciationPrint";
import { financialExcel } from "./depreciationExcel";
import * as XLSX from "xlsx";
import {financialExcelCell} from '../shared/depreciation';
describe("financial outputs", () => {
  it('exports summable signed decimals while retaining large amounts and textual identifiers',()=>{
    const ws=XLSX.utils.aoa_to_sheet([['الرمز','المبلغ'],['00123',financialExcelCell('1234.56')],['00124',financialExcelCell('-1234.56')],['00125',financialExcelCell('12345678901234.56')]]);
    const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'report');
    const exported=XLSX.read(XLSX.write(wb,{type:'buffer',bookType:'xlsx'}),{type:'buffer'}).Sheets.report;
    expect(exported.A2).toMatchObject({t:'s',v:'00123'});expect(exported.B2).toMatchObject({t:'n',v:1234.56});expect(exported.B3).toMatchObject({t:'n',v:-1234.56});expect(exported.B4).toMatchObject({t:'s',v:'12345678901234.56'});
  });
  it("escapes imported names and includes the selected period and incomplete-month warning", () => {
    const html = financialPrintHtml(
      {
        from: "2026-05-01",
        to: "2026-05-31",
        organizationName: "<script>bad()</script>",
        currency: "SAR",
        basis: "معتمد",
        pendingMonths: ["2026-05"],
        groups: [
          { classification: "<img src=x onerror=bad()>", charge: "200.00" },
        ],
      },
      "summary",
      [
        ["classification", "التصنيف"],
        ["charge", "إهلاك الفترة"],
      ]
    );
    expect(html).toContain("من 01/05/2026 إلى 31/05/2026");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<img");
    expect(html).toContain("فترات لم تعتمد");
    expect(html).toContain("200.00");
  });
  it("preserves a comparison title containing both complete periods", () => {
    const title =
      "الحالية من 01/05/2026 إلى 31/05/2026 — المقارنة من 01/04/2026 إلى 30/04/2026";
    expect(
      financialPrintHtml(
        { title, groups: [], pendingMonths: [] },
        "comparison",
        [["classification", "التصنيف"]]
      )
    ).toContain(title);
  });
  it("exports correction evidence and preserves amounts beyond Excel precision as text", () => {
    const value = "9999999999999999.99",
      base64 = financialExcel(
        [
          {
            code: "COR1",
            effectiveDate: "2026-05-01",
            kind: "CORRECTION",
            snapshot: {
              currency: "SAR",
              lines: [{ account: "أصول", debit: value, credit: "0.00" }],
              details: [
                {
                  batchId: 1,
                  unit: "U1",
                  before: {
                    cost: "1.00",
                    accumulated: "0.00",
                    impairment: "0.00",
                  },
                  after: {
                    cost: "2.00",
                    accumulated: "0.00",
                    impairment: "0.00",
                  },
                },
              ],
            },
          },
        ],
        "تصحيح"
      );
    const workbook = XLSX.read(base64, { type: "base64" });
    expect(workbook.SheetNames).toContain("تفاصيل التصحيحات");
    expect(workbook.Sheets["القيود"].H4).toMatchObject({ t: "s", v: value });
  });
});
