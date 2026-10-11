import { escapeHtml } from "@shared/html";
/**
 * exclusionReport.ts - توليد تقرير الاستبعاد HTML
 * ===================================================
 * تصميم احترافي - جاهز للطباعة A4
 */

import { isDisplayImageUrl } from "@shared/imageUrls";

interface ResponsiblePerson {
  job: string;
  name: string;
}

interface ExclusionReportData {
  exclusionCode: string;
  exclusionMode: "full" | "partial";
  entityType: "asset" | "custody";
  entityName: string;
  entityCode: string;
  reason: string;
  originalQuantity?: number | null;
  previouslyExcluded?: number | null;
  previouslyReplaced?: number | null;
  effectiveDate?: string | null;
  quantityBefore: number;
  quantityExcluded: number;
  quantityRemaining: number;
  oldEmployeeName?: string;
  oldDepartmentName?: string;
  oldLocationName?: string;
  responsibles: ResponsiblePerson[];
  exclusionDate: string;
  images?: string[];
}

export function generateExclusionReport(data: ExclusionReportData): string {
  const isPartial = data.exclusionMode === "partial";
  const isAsset = data.entityType === "asset";
  const itemLabel = isAsset ? "الأصل" : "العهدة";
  const modeLabel = isPartial ? "استبعاد جزئي" : "استبعاد كلي";
  const modeColor = isPartial ? "#b45309" : "#dc2626";

  const signaturesHTML = data.responsibles
    .map(
      (r) => `
      <td class="sig-cell">
        <div class="sig-job">${escapeHtml(r.job)}</div>
        <div class="sig-name">${escapeHtml(r.name)}</div>
        <div class="sig-line"></div>
        <div class="sig-label">التوقيع</div>
      </td>`
    )
    .join("");

  const today = new Date().toLocaleDateString("ar-SA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>تقرير استبعاد - ${escapeHtml(data.exclusionCode)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;800;900&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Tajawal', Arial, sans-serif;
      background: #e8ecef;
      color: #1a1a2e;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .page {
      width: 210mm;
      min-height: 297mm;
      margin: 20px auto;
      background: #fff;
      box-shadow: 0 4px 24px rgba(0,0,0,0.1);
      position: relative;
      overflow: hidden;
    }
    .page::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 6px;
      background: linear-gradient(90deg, #0f4c5c, #1a7a8a, ${escapeHtml(modeColor)});
    }
    .page-content { padding: 28mm 20mm 20mm 20mm; }
    .header { text-align: center; margin-bottom: 24px; }
    .header h1 { font-size: 24px; font-weight: 800; color: #0f4c5c; }
    .header .mode-badge {
      display: inline-block;
      padding: 4px 16px;
      border-radius: 20px;
      font-size: 13px;
      font-weight: 700;
      color: #fff;
      background: ${escapeHtml(modeColor)};
      margin-top: 6px;
    }
    .header .code {
      font-size: 11px;
      color: #6b7280;
      font-family: monospace;
      margin-top: 4px;
    }
    .header::after {
      content: '';
      display: block;
      width: 80px;
      height: 3px;
      background: linear-gradient(90deg, #b8860b, #0f4c5c);
      margin: 12px auto 0;
      border-radius: 2px;
    }
    .info-box {
      border: 1.5px solid #d1dde0;
      border-radius: 8px;
      overflow: hidden;
      margin-bottom: 20px;
    }
    .info-box-title {
      background: #f0f7f8;
      padding: 8px 16px;
      font-size: 12px;
      font-weight: 700;
      color: #0f4c5c;
      border-bottom: 1px solid #d1dde0;
    }
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0;
    }
    .info-item {
      padding: 10px 16px;
      border-bottom: 1px solid #e8eff1;
      font-size: 12px;
    }
    .info-item:nth-child(odd) { border-left: 1px solid #e8eff1; }
    .info-item strong { color: #0f4c5c; margin-left: 4px; }
    .qty-summary {
      display: flex;
      gap: 12px;
      margin-bottom: 20px;
    }
    .qty-card {
      flex: 1;
      text-align: center;
      padding: 14px;
      border-radius: 8px;
      border: 1.5px solid;
    }
    .qty-card.before { border-color: #d1d5db; background: #f9fafb; }
    .qty-card.excluded { border-color: ${escapeHtml(modeColor)}40; background: ${escapeHtml(modeColor)}10; }
    .qty-card.remaining { border-color: #059669; background: #ecfdf5; }
    .qty-card .qty-num { font-size: 28px; font-weight: 800; }
    .qty-card.before .qty-num { color: #374151; }
    .qty-card.excluded .qty-num { color: ${escapeHtml(modeColor)}; }
    .qty-card.remaining .qty-num { color: #059669; }
    .qty-card .qty-label { font-size: 11px; color: #6b7280; margin-top: 2px; }
    .reason-box {
      background: #fdf8ed;
      border: 1px solid #daa52040;
      border-radius: 8px;
      padding: 14px 16px;
      margin-bottom: 20px;
    }
    .reason-box .reason-title { font-size: 11px; font-weight: 700; color: #b8860b; margin-bottom: 6px; }
    .reason-box .reason-text { font-size: 13px; color: #374151; line-height: 1.7; }
    .sig-section { margin-top: 24px; }
    .sig-title { font-size: 12px; font-weight: 700; color: #0f4c5c; margin-bottom: 12px; }
    .sig-table { width: 100%; border-collapse: collapse; }
    .sig-cell {
      text-align: center;
      padding: 8px 6px;
      border: 1px solid #d1dde0;
      vertical-align: top;
    }
    .sig-job { font-size: 11px; font-weight: 700; color: #0f4c5c; }
    .sig-name { font-size: 11px; color: #374151; margin-top: 2px; }
    .sig-line {
      width: 80%;
      height: 1px;
      background: #374151;
      margin: 20px auto 4px;
    }
    .sig-label { font-size: 10px; color: #9ca3af; }
    .images-section { margin-bottom: 20px; }
    .images-title { font-size: 12px; font-weight: 700; color: #0f4c5c; margin-bottom: 10px; }
    .images-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
    }
    .img-item {
      border: 1px solid #d1dde0;
      border-radius: 6px;
      overflow: hidden;
      aspect-ratio: 4/3;
    }
    .img-item img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .footer {
      margin-top: 30px;
      padding-top: 12px;
      border-top: 1px solid #e8eff1;
      font-size: 10px;
      color: #9ca3af;
      text-align: center;
    }
    @media print {
      body { background: #fff; }
      .page { margin: 0; box-shadow: none; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="page-content">
      <div class="header">
        <h1>تقرير ${escapeHtml(modeLabel)}</h1>
        <div class="mode-badge">${escapeHtml(modeLabel)} - ${escapeHtml(itemLabel)}</div>
        <div class="code">رقم العملية: ${escapeHtml(data.exclusionCode)} | تاريخ الطباعة: ${escapeHtml(today)}</div>
      </div>

      <div class="info-box">
        <div class="info-box-title">بيانات ${escapeHtml(itemLabel)} المستبعد</div>
        <div class="info-grid">
          <div class="info-item"><strong>اسم ${escapeHtml(itemLabel)}:</strong> ${escapeHtml(data.entityName)}</div>
          <div class="info-item"><strong>رمز ${escapeHtml(itemLabel)}:</strong> ${escapeHtml(data.entityCode)}</div>
          <div class="info-item"><strong>المسؤول:</strong> ${escapeHtml(data.oldEmployeeName || "—")}</div>
          <div class="info-item"><strong>القسم:</strong> ${escapeHtml(data.oldDepartmentName || "—")}</div>
          <div class="info-item"><strong>الموقع:</strong> ${escapeHtml(data.oldLocationName || "—")}</div>
          <div class="info-item"><strong>تاريخ تسجيل الاستبعاد:</strong> ${escapeHtml(new Date(data.exclusionDate).toLocaleDateString("ar-SA"))}</div>
        </div>
      </div>

      <div class="info-box">
        <div class="info-grid">
          <div class="info-item"><strong>الكمية الأصلية:</strong> ${escapeHtml(data.originalQuantity ?? "غير محفوظة")}</div>
          <div class="info-item"><strong>المستبعد سابقًا:</strong> ${escapeHtml(data.previouslyExcluded ?? "غير محفوظ")}</div>
          <div class="info-item"><strong>المستبدل بالضمان سابقًا:</strong> ${escapeHtml(data.previouslyReplaced ?? "غير محفوظ")}</div>
          <div class="info-item"><strong>تاريخ سريان الاستبعاد:</strong> ${escapeHtml(data.effectiveDate || "غير محفوظ")}</div>
        </div>
      </div>
      <div class="qty-summary">
        <div class="qty-card before">
          <div class="qty-num">${escapeHtml(data.quantityBefore)}</div>
          <div class="qty-label">الكمية قبل الاستبعاد</div>
        </div>
        <div class="qty-card excluded">
          <div class="qty-num">${escapeHtml(data.quantityExcluded)}</div>
          <div class="qty-label">الكمية المستبعدة</div>
        </div>
        <div class="qty-card remaining">
          <div class="qty-num">${escapeHtml(data.quantityRemaining)}</div>
          <div class="qty-label">الكمية المتبقية</div>
        </div>
      </div>

      <div class="reason-box">
        <div class="reason-title">سبب الاستبعاد:</div>
        <div class="reason-text">${escapeHtml(data.reason)}</div>
      </div>

      ${
        data.images && data.images.length > 0
          ? `<div class="images-section">
          <div class="images-title">صور الحالة عند الاستبعاد (${escapeHtml(data.images.length)} صورة):</div>
          <div class="images-grid">
            ${data.images.filter(isDisplayImageUrl).map(url => `
              <div class="img-item">
                <img src="${escapeHtml(url)}" alt="صورة الاستبعاد" crossorigin="anonymous" />
              </div>
            `).join('')}
          </div>
        </div>`
          : ""
      }

      ${
        data.responsibles.length > 0
          ? `<div class="sig-section">
          <div class="sig-title">المسؤولون والتوقيعات:</div>
          <table class="sig-table">
            <tr>${signaturesHTML}</tr>
          </table>
        </div>`
          : ""
      }

      <div class="footer">
        تم إصدار هذا التقرير بواسطة نظام إدارة العهد والأصول | ${escapeHtml(today)}
      </div>
    </div>
  </div>
</body>
</html>`;
}

export function printExclusionReport(data: ExclusionReportData): void {
  const html = generateExclusionReport({ ...data, images: data.images?.filter(isDisplayImageUrl).map(url =>
    url.startsWith("/api/files/") ? new URL(url, window.location.origin).href : url
  ) });
  const printWindow = window.open("", "_blank");
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
    }, 800);
  }
}
