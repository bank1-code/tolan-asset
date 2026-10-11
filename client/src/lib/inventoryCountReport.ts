import { normalizeCountItems, serialDifference } from "@shared/inventoryCount";
import { escapeHistoryHtml as escape } from "./archiveReport";

export function inventoryCountReport(session: any, differencesOnly = false) {
  const items = normalizeCountItems(
    session.items || [],
    session.sessionType
  ).filter(
    item =>
      !differencesOnly ||
      (item.actualQuantity != null &&
        item.actualQuantity !== item.expectedQuantity) ||
      serialDifference(item)
  );
  const scope = session.scope || {};
  const state: Record<string, string> = {
    DRAFT: "مسودة",
    SUBMITTED: "بانتظار الاعتماد",
    APPROVED: "معتمد",
    CANCELLED: "ملغاة",
  };
  const rows = items
    .map(
      item =>
        `<tr><td>${escape(item.entityType === "asset" ? "أصل" : "عهدة")}<br>${escape(item.code)}</td><td>${escape(item.name)}${item.expectedSerialNumbers?.length ? `<br>التسلسليات المتوقعة: ${escape(item.expectedSerialNumbers.join("، "))}<br>المفحوصة: ${escape(item.observedSerialNumbers?.join("، ") || (item.observedSerialNumbers == null ? "لم تُفحص" : "لا توجد"))}` : ""}</td><td>${escape([item.locationName, item.branchName, item.departmentName, item.employeeName].filter(Boolean).join(" / "))}</td><td>${escape(item.expectedQuantity ?? "غير محفوظ")}</td><td>${escape(item.actualQuantity ?? "لم يُفحص")}</td><td>${escape(item.actualQuantity != null && item.expectedQuantity != null ? item.actualQuantity - item.expectedQuantity : "—")}</td><td>${escape(item.reason || "—")}<br>${serialDifference(item) ? "اختلاف هوية الأجهزة" : ""}</td><td>${escape(item.countedAt ? new Date(item.countedAt).toLocaleString("ar-SA") : "غير محفوظ")}</td></tr>`
    )
    .join("");
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>محضر جرد ${escape(session.id)}</title><style>body{font-family:Tahoma,Arial;color:#17212b;padding:24px}table{border-collapse:collapse;width:100%;font-size:12px}th,td{padding:8px;border:1px solid #aaa;text-align:right;white-space:pre-wrap;overflow-wrap:anywhere}th{background:#eee}thead{display:table-header-group}tr{break-inside:avoid}@page{size:A4 landscape;margin:12mm}@media print{button{display:none}body{padding:0}}</style></head><body><h1>${differencesOnly ? "تقرير فروق" : "محضر"} الجرد #${escape(session.id)}</h1><p>الحالة: ${escape(state[session.status] || session.status)} · النطاق: ${escape([scope.locationName, scope.branchName, scope.departmentName || session.departmentName, scope.employeeName].filter(Boolean).join(" / "))}</p><p>بدء الجلسة: ${escape(new Date(session.createdAt).toLocaleString("ar-SA"))} · المُعدّ: ${escape(session.performedByName || "—")} · المعتمد: ${escape(session.approvedByName || "غير معتمد")} · تاريخ الاعتماد: ${escape(session.approvedAt ? new Date(session.approvedAt).toLocaleString("ar-SA") : "—")}</p><table><thead><tr><th>النوع والكود</th><th>الاسم</th><th>التخصيص وقت بدء الجرد</th><th>المتوقع</th><th>الفعلي</th><th>الفرق</th><th>السبب</th><th>وقت الفحص</th></tr></thead><tbody>${rows}</tbody></table><p>الجرد يثبت نتيجة الفحص ولا يغير كمية الأصل. البيانات غير المحفوظة في الجلسات القديمة لا تُستنتج.</p><button onclick="window.print()">طباعة</button></body></html>`;
}
