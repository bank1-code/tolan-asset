export type CountKind = "asset" | "custody";
export type CountScope = {
  sessionType: "assets" | "custody" | "both";
  locationId?: number;
  branchId?: number;
  departmentId?: number;
  employeeId?: number;
  search?: string;
};
export type CountItem = {
  id: number;
  entityType: CountKind;
  code: string;
  name: string;
  expectedQuantity: number;
  actualQuantity: number | null;
  reason: string;
  status: "pending" | "scanned" | "missing";
  locationId?: number | null;
  locationName?: string | null;
  branchId?: number | null;
  branchName?: string | null;
  departmentId?: number | null;
  departmentName?: string | null;
  employeeId?: number | null;
  employeeName?: string | null;
  expectedSerialNumbers?: string[];
  observedSerialNumbers?: string[] | null;
  serialTrackingComplete?: boolean;
  countedAt?: string | null;
};
export const countItemKey = (item: { id: number; entityType: string }) =>
  `${item.entityType}:${item.id}`;
export function normalizeCountItems(
  items: any[],
  sessionType: string
): CountItem[] {
  return items.map(item => ({
    ...item,
    actualQuantity: item.actualQuantity ?? null,
    entityType:
      item.entityType || (sessionType === "custody" ? "custody" : "asset"),
  }));
}
export function serialDifference(item: CountItem) {
  if (!item.serialTrackingComplete || item.observedSerialNumbers == null)
    return 0;
  const expected = item.expectedSerialNumbers || [],
    observed = item.observedSerialNumbers;
  return Math.max(
    expected.filter(value => !observed.includes(value)).length,
    observed.filter(value => !expected.includes(value)).length
  );
}
export function validateCountForSubmission(items: CountItem[]) {
  const selected = itemsForSubmission(items);
  if (!selected.length)
    return "سجل كمية فعلية لعنصر واحد على الأقل قبل الإرسال";
  for (const item of selected) {
    if (item.actualQuantity === null)
      return `الكمية الفعلية لم تُسجل: ${item.name}`;
    if (item.serialTrackingComplete && item.observedSerialNumbers == null)
      return `افحص الأرقام التسلسلية: ${item.name}`;
    if (
      item.observedSerialNumbers != null &&
      item.observedSerialNumbers.length !== item.actualQuantity
    )
      return `عدد الأرقام المفحوصة لا يطابق الكمية الفعلية: ${item.name}`;
    if (
      (item.actualQuantity !== item.expectedQuantity ||
        serialDifference(item)) &&
      !item.reason?.trim()
    )
      return `سبب الفرق مطلوب: ${item.name}`;
  }
  return null;
}
export function itemsForSubmission(items: CountItem[]) {
  return items.filter(
    item => item.actualQuantity != null || item.observedSerialNumbers != null
  );
}
export function visibleCountItems(
  items: CountItem[],
  status: string,
  scope: any
) {
  return scope?.submissionSummary && ["SUBMITTED", "APPROVED"].includes(status)
    ? itemsForSubmission(items)
    : items;
}
