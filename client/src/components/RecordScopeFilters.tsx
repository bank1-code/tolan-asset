import { emptyRecordFilters, type RecordFilters } from "@shared/recordFilters";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
export default function RecordScopeFilters({
  value,
  onChange,
  locations,
  branches,
  departments,
  employees,
  disabled = false,
}: {
  value: RecordFilters;
  onChange: (value: RecordFilters) => void;
  locations: any[];
  branches: any[];
  departments: any[];
  employees: any[];
  disabled?: boolean;
}) {
  const change = (key: keyof RecordFilters, selected: string) => {
    const next = { ...value, [key]: selected };
    if (
      key === "location" &&
      next.branch &&
      selected &&
      branches.find(row => row.id === Number(next.branch))?.locationId !==
        Number(selected)
    )
      next.branch = "";
    const department = departments.find(
      row => row.id === Number(next.department)
    );
    const departmentBranch = branches.find(
      row => row.id === department?.branchId
    );
    if (
      next.department &&
      ((next.branch && department?.branchId !== Number(next.branch)) ||
        (next.location &&
          (department?.locationId ?? departmentBranch?.locationId) !==
            Number(next.location)))
    )
      next.department = "";
    onChange(next);
  };
  const fields = [
    [
      "type",
      "نوع السجلات",
      [
        { id: "asset", name: "أصول" },
        { id: "custody", name: "عهد" },
      ],
      "كلاهما",
      "all",
    ],
    ["location", "الموقع", locations, "جميع المواقع", ""],
    [
      "branch",
      "الفرع",
      branches.filter(
        row => !value.location || row.locationId === Number(value.location)
      ),
      "جميع الفروع",
      "",
    ],
    [
      "department",
      "القسم",
      departments.filter(
        row =>
          (!value.branch || row.branchId === Number(value.branch)) &&
          (!value.location ||
            (row.locationId ??
              branches.find(branch => branch.id === row.branchId)
                ?.locationId) === Number(value.location))
      ),
      "جميع الأقسام",
      "",
    ],
    ["employee", "الموظف", employees, "جميع الموظفين", ""],
  ] as const;
  return (
    <div dir="rtl" className="space-y-3 rounded-xl border bg-muted/20 p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {fields.map(([key, label, rows, all, allValue]) => (
          <label key={key} className="space-y-1 text-sm">
            <span className="block text-xs font-medium text-muted-foreground">
              {label}
            </span>
            <select
              aria-label={label}
              value={value[key]}
              disabled={disabled}
              className="h-10 w-full min-w-0 rounded-md border bg-background px-2 text-sm"
              onChange={event => change(key, event.target.value)}
            >
              <option value={allValue}>{all}</option>
              {rows.map(row => (
                <option key={row.id} value={row.id}>
                  {"code" in row && row.code ? `${row.code} — ` : ""}
                  {"fullName" in row ? row.fullName : row.name}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Input
          aria-label="البحث بالاسم أو الرمز"
          maxLength={200}
          className="min-w-40 flex-1"
          placeholder="ابحث بالاسم أو الرمز…"
          value={value.search}
          disabled={disabled}
          onChange={event => change("search", event.target.value)}
        />
        <Button
          variant="outline"
          disabled={disabled}
          onClick={() => onChange(emptyRecordFilters())}
        >
          عرض الكل / مسح الفلاتر
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        اختر أي فلتر منفردًا أو اجمع أكثر من فلتر. لا يشترط اختيار الموقع.
      </p>
    </div>
  );
}
