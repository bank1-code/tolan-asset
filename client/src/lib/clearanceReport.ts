/**
 * clearanceReport.ts - توليد تقرير براءة الذمة HTML
 * ====================================================
 * تصميم راقي واحترافي - صفحتان A4 جاهزتان للطباعة
 * الصفحة 1: نموذج براءة ذمة
 * الصفحة 2: إقرار عهد (بيان الأصول والعهد)
 */

interface DepartmentItems {
  department: string;
  items: { id: number; name: string; code: string; quantity: number }[];
}

interface ClearanceReportData {
  employeeName: string;
  fingerprintId: number;
  idNumber: string;
  reason: string;
  lastWorkDay: string; // YYYY-MM-DD
  dayName: string;
  statements: string[];
  signatures: string[];
  assets: DepartmentItems[];
  custody: DepartmentItems[];
  departmentAlternates: Record<string, string>;
  clearanceCode: string;
}

export function generateClearanceReport(data: ClearanceReportData): string {
  const formattedDate = data.lastWorkDay.replace(/-/g, "/");
  const today = new Date().toISOString().split("T")[0].replace(/-/g, "/");

  // حساب إجمالي الأصول والعهد
  const totalAssets = data.assets.reduce((sum, d) => sum + d.items.length, 0);
  const totalCustody = data.custody.reduce((sum, d) => sum + d.items.length, 0);
  const totalAll = totalAssets + totalCustody;

  // تجميع الأقسام الفريدة
  const allDepartments = new Set<string>();
  data.assets.forEach(a => allDepartments.add(a.department));
  data.custody.forEach(c => allDepartments.add(c.department));
  const departments = Array.from(allDepartments).sort();

  // تحديد الملاحظة الختامية حسب سبب المغادرة
  let footerNote = "";
  if (data.reason === "خروج وعودة" || data.reason === "إجازة داخلية") {
    footerNote = "سيتم إرجاع هذه الأصول والعهد للموظف حين عودته، وتخلى مسؤولية الموظف المستلم المؤقت بمجرد عودة الموظف الأساسي.";
  } else {
    footerNote = "تم نقل جميع الأصول والعهد المذكورة أعلاه إلى الموظفين البدلاء المحددين، ويتحمل كل مستلم المسؤولية الكاملة عن ما تم استلامه.";
  }

  // بناء بنود البراءة مع استبدال المتغيرات
  const processedStatements = data.statements.map((stmt, i) => {
    if (i === 0) {
      return stmt
        .replace("{day}", data.dayName)
        .replace("{date}", formattedDate);
    }
    return stmt;
  });

  // بناء جداول الأقسام للصفحة 2
  let departmentSectionsHTML = "";
  for (const dept of departments) {
    const deptAssets = data.assets.find(a => a.department === dept)?.items || [];
    const deptCustody = data.custody.find(c => c.department === dept)?.items || [];
    const alternate = data.departmentAlternates[dept] || "غير محدد";

    departmentSectionsHTML += `
      <div class="dept-section">
        <div class="dept-header">
          <div class="dept-title">
            <span class="dept-icon">◆</span>
            ${dept}
          </div>
          <div class="dept-alternate">
            <span class="alt-label">المستلم البديل:</span>
            <span class="alt-name">${alternate}</span>
          </div>
        </div>
        <div class="dept-body">`;

    // جدول الأصول
    if (deptAssets.length > 0) {
      departmentSectionsHTML += `
          <div class="table-group">
            <div class="table-label assets-label">الأصول</div>
            <table class="items-table">
              <thead>
                <tr>
                  <th class="col-num">م</th>
                  <th class="col-name">اسم الأصل</th>
                  <th class="col-code">الرمز</th>
                  <th class="col-qty">الكمية</th>
                </tr>
              </thead>
              <tbody>`;
      deptAssets.forEach((item, idx) => {
        departmentSectionsHTML += `
                <tr>
                  <td class="col-num">${idx + 1}</td>
                  <td class="col-name">${item.name}</td>
                  <td class="col-code">${item.code}</td>
                  <td class="col-qty">${item.quantity}</td>
                </tr>`;
      });
      departmentSectionsHTML += `
              </tbody>
            </table>
          </div>`;
    }

    // جدول العهد
    if (deptCustody.length > 0) {
      departmentSectionsHTML += `
          <div class="table-group">
            <div class="table-label custody-label">العهد</div>
            <table class="items-table">
              <thead>
                <tr>
                  <th class="col-num">م</th>
                  <th class="col-name">اسم العهدة</th>
                  <th class="col-code">الرمز</th>
                  <th class="col-qty">الكمية</th>
                </tr>
              </thead>
              <tbody>`;
      deptCustody.forEach((item, idx) => {
        departmentSectionsHTML += `
                <tr>
                  <td class="col-num">${idx + 1}</td>
                  <td class="col-name">${item.name}</td>
                  <td class="col-code">${item.code}</td>
                  <td class="col-qty">${item.quantity}</td>
                </tr>`;
      });
      departmentSectionsHTML += `
              </tbody>
            </table>
          </div>`;
    }

    departmentSectionsHTML += `
        </div>
      </div>`;
  }

  // بناء بنود التوقيعات
  const signaturesHTML = data.signatures
    .map(sig => `<td class="sig-cell"><div class="sig-title">${sig}</div><div class="sig-line"></div></td>`)
    .join("");

  // بناء بنود البراءة
  const statementsHTML = processedStatements
    .map((stmt, i) => `<li${i === 0 ? ' class="first-statement"' : ''}>${stmt}</li>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>براءة ذمة - ${data.employeeName} - ${data.clearanceCode}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;800;900&display=swap');

        :root {
            --primary: #0f4c5c;
            --primary-light: #1a7a8a;
            --primary-lighter: #e8f4f6;
            --primary-bg: #f0f7f8;
            --gold: #b8860b;
            --gold-light: #daa520;
            --gold-bg: #fdf8ed;
            --text-dark: #1a1a2e;
            --text-medium: #3d3d5c;
            --text-light: #6b7280;
            --border-color: #d1dde0;
            --border-light: #e8eff1;
            --white: #ffffff;
            --bg-subtle: #fafbfc;
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Tajawal', 'Segoe UI', Arial, sans-serif;
            background: #e8ecef;
            color: var(--text-dark);
            line-height: 1.7;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }

        .page {
            width: 210mm;
            min-height: 297mm;
            margin: 20px auto;
            background: var(--white);
            box-shadow: 0 4px 24px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04);
            position: relative;
            overflow: hidden;
        }

        /* ===== الشريط العلوي الزخرفي ===== */
        .page::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 6px;
            background: linear-gradient(90deg, var(--primary), var(--primary-light), var(--gold-light), var(--gold));
        }

        .page-content {
            padding: 28mm 20mm 20mm 20mm;
        }

        /* ===== الهيدر ===== */
        .header {
            text-align: center;
            margin-bottom: 24px;
            position: relative;
        }

        .header::after {
            content: '';
            display: block;
            width: 80px;
            height: 3px;
            background: linear-gradient(90deg, var(--gold), var(--primary));
            margin: 12px auto 0;
            border-radius: 2px;
        }

        .header h1 {
            font-size: 26px;
            font-weight: 800;
            color: var(--primary);
            letter-spacing: 1px;
            margin-bottom: 4px;
        }

        .header .date {
            font-size: 12px;
            color: var(--text-light);
            font-weight: 500;
        }

        .header .code {
            font-size: 10px;
            color: var(--text-light);
            font-family: monospace;
            margin-top: 2px;
        }

        /* ===== جدول بيانات الموظف ===== */
        .employee-info {
            border: 1.5px solid var(--border-color);
            border-radius: 8px;
            overflow: hidden;
            margin-bottom: 20px;
        }

        .employee-info table {
            width: 100%;
            border-collapse: collapse;
        }

        .employee-info td {
            padding: 10px 16px;
            font-size: 12.5px;
            border-bottom: 1px solid var(--border-light);
        }

        .employee-info tr:last-child td {
            border-bottom: none;
        }

        .employee-info td strong {
            color: var(--primary);
            font-weight: 700;
            margin-left: 4px;
        }

        .employee-info .info-row-3 td {
            width: 33.33%;
        }

        /* ===== بنود البراءة ===== */
        .statements {
            margin: 20px 0;
            padding: 16px 20px;
            background: var(--bg-subtle);
            border-radius: 8px;
            border: 1px solid var(--border-light);
        }

        .statements ul {
            list-style: none;
            padding: 0;
        }

        .statements li {
            position: relative;
            padding: 5px 20px 5px 0;
            font-size: 12.5px;
            color: var(--text-medium);
            line-height: 1.8;
        }

        .statements li::before {
            content: '●';
            position: absolute;
            right: 0;
            color: var(--gold);
            font-size: 8px;
            top: 10px;
        }

        .statements li.first-statement {
            font-weight: 600;
            color: var(--text-dark);
        }

        /* ===== جدول التوقيعات ===== */
        .signatures-section {
            margin: 24px 0 12px;
        }

        .signatures-table {
            width: 100%;
            border-collapse: collapse;
        }

        .sig-cell {
            text-align: center;
            padding: 8px 6px;
            width: 20%;
        }

        .sig-title {
            font-size: 11px;
            font-weight: 700;
            color: var(--primary);
            margin-bottom: 20px;
        }

        .sig-line {
            width: 70%;
            height: 1px;
            background: var(--border-color);
            margin: 0 auto;
        }

        .responsibility-note {
            text-align: center;
            font-size: 10.5px;
            color: var(--text-light);
            margin-top: 10px;
            font-style: italic;
        }

        /* ===== ملاحظات الرئيس التنفيذي ===== */
        .ceo-section {
            margin-top: 20px;
            padding-top: 16px;
            border-top: 1.5px solid var(--border-color);
        }

        .ceo-notes-title {
            font-size: 12px;
            font-weight: 700;
            color: var(--primary);
            margin-bottom: 8px;
        }

        .ceo-notes-lines {
            padding: 0 16px;
        }

        .ceo-notes-lines .note-line {
            border-bottom: 1px dashed var(--border-color);
            height: 28px;
            position: relative;
            margin-bottom: 4px;
        }

        .ceo-notes-lines .note-line .num {
            position: absolute;
            right: -16px;
            top: 6px;
            font-size: 10px;
            color: var(--text-light);
        }

        /* ===== التوقيعات التنفيذية ===== */
        .executive-signatures {
            margin-top: 20px;
            width: 100%;
            border-collapse: collapse;
        }

        .executive-signatures td {
            text-align: center;
            padding: 10px;
            width: 50%;
            vertical-align: top;
        }

        .exec-title {
            font-size: 14px;
            font-weight: 800;
            color: var(--primary);
            margin-bottom: 16px;
        }

        .exec-name {
            font-size: 14px;
            font-weight: 700;
            color: var(--gold);
        }

        /* ===== الملحوظة ===== */
        .final-note {
            text-align: center;
            margin-top: 16px;
            padding: 10px 16px;
            background: var(--primary-lighter);
            border-radius: 6px;
            border: 1px solid var(--border-color);
        }

        .final-note p {
            font-size: 10px;
            color: var(--primary);
            font-weight: 500;
        }

        /* ===== الصفحة 2: إقرار العهد ===== */
        .summary-box {
            display: flex;
            justify-content: center;
            gap: 24px;
            margin: 16px 0;
            padding: 14px 20px;
            background: linear-gradient(135deg, var(--primary-lighter), var(--gold-bg));
            border-radius: 8px;
            border: 1.5px solid var(--border-color);
        }

        .summary-item {
            text-align: center;
        }

        .summary-item .label {
            font-size: 10px;
            color: var(--text-light);
            font-weight: 500;
            display: block;
        }

        .summary-item .value {
            font-size: 22px;
            font-weight: 800;
            color: var(--primary);
        }

        .summary-item .divider {
            width: 1px;
            background: var(--border-color);
            align-self: stretch;
        }

        .section-title {
            font-size: 15px;
            font-weight: 800;
            color: var(--primary);
            text-align: center;
            margin: 16px 0 12px;
            position: relative;
        }

        .section-title::before,
        .section-title::after {
            content: '';
            display: inline-block;
            width: 40px;
            height: 2px;
            background: var(--gold);
            vertical-align: middle;
            margin: 0 10px;
        }

        /* ===== أقسام الأصول والعهد ===== */
        .dept-section {
            margin-bottom: 14px;
            border: 1.5px solid var(--border-color);
            border-radius: 8px;
            overflow: hidden;
            page-break-inside: avoid;
        }

        .dept-header {
            background: linear-gradient(135deg, var(--primary), var(--primary-light));
            padding: 10px 16px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .dept-title {
            font-size: 13px;
            font-weight: 700;
            color: var(--white);
        }

        .dept-icon {
            margin-left: 6px;
            color: var(--gold-light);
        }

        .dept-alternate {
            font-size: 11px;
            color: rgba(255,255,255,0.9);
        }

        .alt-label {
            font-weight: 500;
        }

        .alt-name {
            font-weight: 700;
            color: var(--gold-light);
            margin-right: 4px;
        }

        .dept-body {
            padding: 10px 12px;
        }

        .table-group {
            margin-bottom: 8px;
        }

        .table-group:last-child {
            margin-bottom: 0;
        }

        .table-label {
            font-size: 11px;
            font-weight: 700;
            padding: 4px 10px;
            border-radius: 4px;
            display: inline-block;
            margin-bottom: 6px;
        }

        .assets-label {
            background: var(--primary-lighter);
            color: var(--primary);
        }

        .custody-label {
            background: var(--gold-bg);
            color: var(--gold);
        }

        .items-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 11px;
        }

        .items-table thead tr {
            background: var(--bg-subtle);
        }

        .items-table th {
            padding: 6px 10px;
            font-weight: 700;
            color: var(--text-medium);
            border-bottom: 1.5px solid var(--border-color);
            text-align: center;
        }

        .items-table th.col-name {
            text-align: right;
        }

        .items-table td {
            padding: 5px 10px;
            border-bottom: 1px solid var(--border-light);
            text-align: center;
            color: var(--text-medium);
        }

        .items-table td.col-name {
            text-align: right;
        }

        .items-table td.col-num {
            color: var(--text-light);
            font-weight: 600;
        }

        .items-table td.col-code {
            font-family: 'Courier New', monospace;
            font-size: 10.5px;
            letter-spacing: 0.5px;
        }

        .items-table tbody tr:last-child td {
            border-bottom: none;
        }

        .items-table tbody tr:hover {
            background: var(--bg-subtle);
        }

        .col-num { width: 35px; }
        .col-code { width: 90px; }
        .col-qty { width: 55px; }

        /* ===== ملاحظة ختامية ===== */
        .footer-note {
            margin-top: 16px;
            padding: 12px 16px;
            background: var(--gold-bg);
            border-radius: 8px;
            border: 1px solid #e8d5a0;
            text-align: center;
        }

        .footer-note p {
            font-size: 11px;
            color: var(--gold);
            font-weight: 600;
        }

        .footer-note .icon {
            margin-left: 4px;
        }

        /* ===== الطباعة ===== */
        @media print {
            body {
                background: white;
                padding: 0;
                margin: 0;
            }
            .page {
                box-shadow: none;
                margin: 0;
                border: none;
                width: 100%;
                min-height: auto;
                height: auto;
                overflow: visible;
                page-break-after: always;
            }
            .page:last-child {
                page-break-after: avoid;
            }
            .page-content {
                padding: 10mm 15mm 10mm 15mm;
            }
            .page-break {
                page-break-before: always;
            }
            .dept-section {
                page-break-inside: avoid;
                overflow: visible;
            }
        }

        @page {
            size: A4;
            margin: 8mm;
        }

        .page-break {
            page-break-before: always;
        }
    </style>
</head>
<body>
    <!-- ===== الصفحة 1: نموذج براءة ذمة ===== -->
    <div class="page">
        <div class="page-content">
            <div class="header">
                <h1>نموذج براءة ذمة</h1>
                <div class="date">التاريخ: ${today}</div>
                <div class="code">${data.clearanceCode}</div>
            </div>

            <div class="employee-info">
                <table>
                    <tr class="info-row-3">
                        <td><strong>اسم الموظف:</strong> ${data.employeeName}</td>
                        <td><strong>رقم الهوية:</strong> ${data.idNumber}</td>
                        <td><strong>البصمة:</strong> ${data.fingerprintId}</td>
                    </tr>
                    <tr>
                        <td colspan="3"><strong>سبب المغادرة:</strong> ${data.reason}</td>
                    </tr>
                    <tr>
                        <td colspan="3"><strong>آخر يوم دوام:</strong> ${data.dayName} الموافق ${formattedDate}</td>
                    </tr>
                </table>
            </div>

            <div class="statements">
                <ul>
                    ${statementsHTML}
                </ul>
            </div>

            <div class="signatures-section">
                <table class="signatures-table">
                    <tr>
                        ${signaturesHTML}
                    </tr>
                </table>
                <p class="responsibility-note">يتحمل الموقعون أعلاه المسئولية في حالة عدم صحة بيانات النموذج كل حسب مهام عمله.</p>
            </div>

            <div class="ceo-section">
                <div class="ceo-notes-title">ملاحظات الرئيس التنفيذي:</div>
                <div class="ceo-notes-lines">
                    <div class="note-line"><span class="num">1</span></div>
                    <div class="note-line"><span class="num">2</span></div>
                </div>

                <table class="executive-signatures">
                    <tr>
                        <td>
                            <div class="exec-title">مدير المشاريع</div>
                            <div class="exec-name">م/ سعد الزكري</div>
                        </td>
                        <td>
                            <div class="exec-title">الرئيس التنفيذي</div>
                            <div class="exec-name">م. زكري بن عبدالله الزكري</div>
                        </td>
                    </tr>
                </table>

                <div class="final-note">
                    <p><strong>ملحوظة:</strong> أي شرح أو تعليق خارج حقول النموذج لا يعتمد إلا بتوقيع الرئيس التنفيذي.</p>
                </div>
            </div>
        </div>
    </div>

    <!-- ===== الصفحة 2: إقرار عهد ===== -->
    <div class="page page-break">
        <div class="page-content">
            <div class="header">
                <h1>إقرار عهد</h1>
                <div class="date">التاريخ: ${today}</div>
                <div class="code">${data.clearanceCode}</div>
            </div>

            <div class="employee-info">
                <table>
                    <tr class="info-row-3">
                        <td><strong>اسم الموظف:</strong> ${data.employeeName}</td>
                        <td><strong>رقم الهوية:</strong> ${data.idNumber}</td>
                        <td><strong>البصمة:</strong> ${data.fingerprintId}</td>
                    </tr>
                    <tr>
                        <td colspan="3"><strong>سبب المغادرة:</strong> ${data.reason}</td>
                    </tr>
                    <tr>
                        <td colspan="3"><strong>آخر يوم دوام:</strong> ${data.dayName} الموافق ${formattedDate}</td>
                    </tr>
                </table>
            </div>

            <div class="summary-box">
                <div class="summary-item">
                    <span class="label">إجمالي الأصول</span>
                    <span class="value">${totalAssets}</span>
                </div>
                <div class="summary-item divider"></div>
                <div class="summary-item">
                    <span class="label">إجمالي العهد</span>
                    <span class="value">${totalCustody}</span>
                </div>
                <div class="summary-item divider"></div>
                <div class="summary-item">
                    <span class="label">المجموع الكلي</span>
                    <span class="value" style="color: var(--gold);">${totalAll}</span>
                </div>
            </div>

            <div class="section-title">بيان الأصول والعهد المسجلة باسم الموظف</div>

            ${departmentSectionsHTML || '<div style="text-align:center; padding: 30px; color: var(--text-light); font-size: 13px;">لا توجد أصول أو عهد مسجلة باسم هذا الموظف</div>'}

            <div class="footer-note">
                <p><span class="icon">📋</span> ملاحظة: ${footerNote}</p>
            </div>
        </div>
    </div>
</body>
</html>`;
}

/**
 * فتح التقرير في نافذة جديدة وطباعته
 */
export function printClearanceReport(data: ClearanceReportData): void {
  const html = generateClearanceReport(data);
  const printWindow = window.open("", "_blank");
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    // تأخير بسيط لتحميل الخطوط
    setTimeout(() => {
      printWindow.print();
    }, 800);
  }
}

/**
 * توليد كود براءة الذمة
 */
export function generateClearanceCode(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const timestamp = Math.floor(now.getTime() / 1000);
  return `CLR-${year}-${month}-${timestamp}`;
}
