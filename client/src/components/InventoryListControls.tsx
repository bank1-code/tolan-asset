import { Input } from "./ui/input";
import { Button } from "./ui/button";
export function filterCountRows(rows: any[], filter: Record<string, string>) {
  return rows.filter(row => {
    const scope = row.scope || {},
      text = [
        row.id,
        row.sessionId,
        row.code,
        row.name,
        row.departmentName,
        row.performedByName,
        row.approvedByName,
        row.reason,
        ...Object.values(scope),
      ]
        .join(" ")
        .toLocaleLowerCase("ar");
    if (filter.search && !text.includes(filter.search.toLocaleLowerCase("ar")))
      return false;
    for (const key of [
      "locationName",
      "branchName",
      "departmentName",
      "employeeName",
      "performedByName",
    ])
      if (
        filter[key] &&
        (row[key] || scope[key]) !== filter[key] &&
        !scope[`${key}List`]?.includes(filter[key])
      )
        return false;
    if (
      filter.type &&
      (row.entityType || row.sessionType) !== filter.type &&
      row.sessionType !== "both"
    )
      return false;
    if (filter.status && (row.processingStatus || row.status) !== filter.status)
      return false;
    const when = row.approvedAt || row.createdAt || row.countedAt;
    if (
      filter.from &&
      (!when ||
        new Date(when).getTime() <
          new Date(`${filter.from}T00:00:00+03:00`).getTime())
    )
      return false;
    if (
      filter.to &&
      (!when ||
        new Date(when).getTime() >=
          new Date(`${filter.to}T00:00:00+03:00`).getTime() + 86400000)
    )
      return false;
    return true;
  });
}
export function CountListFilters({
  rows,
  value,
  onChange,
  differences = false,
}: {
  rows: any[];
  value: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
  differences?: boolean;
}) {
  const set = (key: string, next: string) =>
    onChange({ ...value, [key]: next });
  return (
    <div className="flex flex-wrap gap-2">
      <Input
        className="w-52"
        aria-label="بحث الجلسات أو الفروق"
        placeholder="بحث بالكود أو الاسم أو الجلسة…"
        value={value.search || ""}
        onChange={event => set("search", event.target.value)}
      />
      {[
        "locationName",
        "branchName",
        "departmentName",
        "employeeName",
        "performedByName",
      ].map((key, index) => (
        <select
          key={key}
          aria-label={
            [
              "فلترة الموقع",
              "فلترة الفرع",
              "فلترة القسم",
              "فلترة الموظف",
              "فلترة المُعدّ",
            ][index]
          }
          className="border rounded p-2 max-w-48"
          value={value[key] || ""}
          onChange={event => set(key, event.target.value)}
        >
          <option value="">
            {
              [
                "كل المواقع",
                "كل الفروع",
                "كل الأقسام",
                "كل الموظفين",
                "كل المُعدّين",
              ][index]
            }
          </option>
          {[
            ...new Set(
              rows
                .flatMap(row => [
                  row[key] || row.scope?.[key],
                  ...(row.scope?.[`${key}List`] || []),
                ])
                .filter(Boolean)
            ),
          ]
            .sort()
            .map((name: any) => (
              <option key={name}>{name}</option>
            ))}
        </select>
      ))}
      <select
        aria-label="فلترة نوع السجل"
        className="border rounded p-2"
        value={value.type || ""}
        onChange={event => set("type", event.target.value)}
      >
        <option value="">كل الأنواع</option>
        <option value={differences ? "asset" : "assets"}>الأصول</option>
        <option value="custody">العهد</option>
        {!differences && <option value="both">كلاهما</option>}
      </select>
      <select
        aria-label="فلترة الحالة"
        className="border rounded p-2"
        value={value.status || ""}
        onChange={event => set("status", event.target.value)}
      >
        <option value="">كل الحالات</option>
        {(differences
          ? [
              ["PENDING", "بانتظار المعالجة"],
              ["IN_PROGRESS", "قيد المعالجة"],
              ["RESOLVED", "تمت المعالجة"],
            ]
          : [
              ["DRAFT", "مسودة"],
              ["SUBMITTED", "بانتظار الاعتماد"],
              ["APPROVED", "معتمد"],
              ["CANCELLED", "ملغى"],
            ]
        ).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>
      <label className="text-xs">
        من
        <Input
          type="date"
          value={value.from || ""}
          onChange={event => set("from", event.target.value)}
        />
      </label>
      <label className="text-xs">
        إلى
        <Input
          type="date"
          value={value.to || ""}
          onChange={event => set("to", event.target.value)}
        />
      </label>
      <Button variant="outline" onClick={() => onChange({})}>
        مسح الفلاتر
      </Button>
    </div>
  );
}
export function CountPagination({
  page,
  total,
  onChange,
}: {
  page: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / 20));
  return (
    <div className="flex items-center gap-3 text-sm">
      <Button
        size="sm"
        variant="outline"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        السابق
      </Button>
      <span>
        {total} سجل · صفحة {page} من {pages}
      </span>
      <Button
        size="sm"
        variant="outline"
        disabled={page >= pages}
        onClick={() => onChange(page + 1)}
      >
        التالي
      </Button>
    </div>
  );
}
