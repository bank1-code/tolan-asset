import type { CountItem } from "@shared/inventoryCount";
import { countItemKey } from "@shared/inventoryCount";
export function recoverCountEdits(items: CountItem[], edits: CountItem[]) {
  const keys = new Set(items.map(countItemKey));
  if (
    edits.length !== items.length ||
    new Set(edits.map(countItemKey)).size !== keys.size ||
    edits.some(item => !keys.has(countItemKey(item)))
  )
    return null;
  return items.map(item => {
    const edit = edits.find(edit => countItemKey(edit) === countItemKey(item))!;
    if (
      edit.actualQuantity !== null &&
      (!Number.isInteger(edit.actualQuantity) ||
        edit.actualQuantity < 0 ||
        edit.actualQuantity > 2147483647)
    )
      throw new Error("بيانات محلية غير صالحة");
    return {
      ...item,
      actualQuantity: edit.actualQuantity,
      reason: typeof edit.reason === "string" ? edit.reason.slice(0, 4000) : "",
      observedSerialNumbers: Array.isArray(edit.observedSerialNumbers)
        ? edit.observedSerialNumbers.filter(value => typeof value === "string")
        : null,
    };
  });
}
