import type { CountItem } from "@shared/inventoryCount";
import { countItemKey, serialDifference } from "@shared/inventoryCount";
import { Input } from "./ui/input";
import { Button } from "./ui/button";

export default function InventoryCountItems({
  items,
  offset,
  editable,
  busy,
  edit,
  open,
}: {
  items: CountItem[];
  offset: number;
  editable: boolean;
  busy: boolean;
  edit: (key: string, change: Partial<CountItem>) => void;
  open: (key: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-background">
      <table className="w-full min-w-[660px] text-sm text-right">
        <thead className="bg-muted/60 text-muted-foreground">
          <tr>
            <th className="w-12 px-4 py-3 font-medium">#</th>
            <th className="px-4 py-3 font-medium">العنصر</th>
            <th className="w-24 px-3 py-3 text-center font-medium">المتوقع</th>
            <th className="w-32 px-3 py-3 text-center font-medium">الفعلي</th>
            <th className="w-40 px-3 py-3 font-medium">نتيجة الفحص</th>
            <th className="w-24 px-3 py-3 font-medium">التفاصيل</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => {
            const key = countItemKey(item),
              checked = item.actualQuantity != null;
            const difference = checked
              ? item.actualQuantity! - item.expectedQuantity
              : 0;
            const identityMismatch = !!serialDifference(item);
            const needsReason =
              checked && (difference !== 0 || identityMismatch);
            const color = !checked
              ? "bg-muted text-muted-foreground"
              : difference || identityMismatch
                ? "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
                : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200";
            return (
              <tr
                key={key}
                className="border-t align-top transition-colors hover:bg-muted/20"
              >
                <td className="px-4 py-5 tabular-nums text-muted-foreground">
                  {offset + index + 1}
                </td>
                <td className="px-4 py-4">
                  <button
                    className="text-right font-semibold leading-6 hover:text-primary"
                    onClick={() => open(key)}
                  >
                    {item.name}
                  </button>
                  <div className="mt-1 flex items-center gap-2 text-xs">
                    <span className="rounded border px-1.5 py-0.5 text-muted-foreground">
                      {item.entityType === "asset" ? "أصل" : "عهدة"}
                    </span>
                    <span dir="ltr" className="font-mono text-muted-foreground">
                      {item.code}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {[item.departmentName, item.employeeName]
                      .filter(Boolean)
                      .join(" · ") || "دون تخصيص"}
                  </p>
                  {(needsReason || !!item.reason) && (
                    <div className="mt-3 max-w-xl">
                      <label
                        className={
                          "mb-1 block text-xs " +
                          (needsReason && !item.reason.trim()
                            ? "text-amber-700"
                            : "text-muted-foreground")
                        }
                      >
                        {needsReason ? "سبب الفرق (مطلوب)" : "ملاحظة الفحص"}
                        <Input
                          aria-label={"سبب الفرق " + item.name}
                          className="mt-1 h-9 bg-background"
                          placeholder="اكتب سبب الفرق هنا"
                          maxLength={4000}
                          disabled={!editable || busy}
                          value={item.reason}
                          onChange={event =>
                            edit(key, { reason: event.target.value })
                          }
                        />
                      </label>
                    </div>
                  )}
                </td>
                <td className="px-3 py-5 text-center font-semibold tabular-nums">
                  {item.expectedQuantity ?? "—"}
                </td>
                <td className="px-3 py-4">
                  <Input
                    aria-label={"الكمية الفعلية " + item.name}
                    className="mx-auto h-10 w-24 text-center text-base font-semibold tabular-nums"
                    type="number"
                    min="0"
                    step="1"
                    max="2147483647"
                    placeholder="—"
                    disabled={!editable || busy}
                    value={item.actualQuantity ?? ""}
                    onChange={event => {
                      const value = event.target.value,
                        number = Number(value);
                      if (
                        !value ||
                        (Number.isInteger(number) &&
                          number >= 0 &&
                          number <= 2147483647)
                      )
                        edit(key, { actualQuantity: value ? number : null });
                    }}
                  />
                </td>
                <td className="px-3 py-4">
                  <span
                    className={
                      "inline-flex rounded-full px-2.5 py-1 text-xs font-medium " +
                      color
                    }
                  >
                    {!checked
                      ? "لم يُفحص"
                      : difference < 0
                        ? `نقص ${Math.abs(difference)}`
                        : difference > 0
                          ? `زيادة ${difference}`
                          : identityMismatch
                            ? "اختلاف الهوية"
                            : "مطابق"}
                  </span>
                  {identityMismatch && difference !== 0 && (
                    <p className="mt-1 text-xs text-amber-700">
                      اختلاف الهوية أيضًا
                    </p>
                  )}
                  {item.countedAt && (
                    <p
                      className="mt-2 text-xs text-muted-foreground"
                      title={new Date(item.countedAt).toLocaleString("ar-SA")}
                    >
                      {new Date(item.countedAt).toLocaleTimeString("ar-SA", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  )}
                  {item.serialTrackingComplete &&
                    item.observedSerialNumbers == null && (
                      <p className="mt-2 text-xs text-amber-700">
                        التسلسليات تحتاج فحصًا
                      </p>
                    )}
                </td>
                <td className="px-3 py-4">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-primary"
                    onClick={() => open(key)}
                  >
                    عرض
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!items.length && (
        <div className="p-10 text-center text-sm text-muted-foreground">
          لا توجد عناصر تطابق البحث أو الفلتر.
        </div>
      )}
    </div>
  );
}
