export type RecordFilters = {
  type: string;
  location: string;
  branch: string;
  department: string;
  employee: string;
  search: string;
};
export const emptyRecordFilters = (): RecordFilters => ({
  type: "all",
  location: "",
  branch: "",
  department: "",
  employee: "",
  search: "",
});
export function matchesRecordFilters(
  row: any,
  filter: RecordFilters,
  departments: any[] = [],
  branches: any[] = []
) {
  const department = departments.find(value => value.id === row.departmentId);
  const branchId = row.branchId ?? department?.branchId;
  const branch = branches.find(value => value.id === branchId);
  const locationId = row.locationId ?? branch?.locationId;
  return (
    (!filter.type || filter.type === "all" || row.entityType === filter.type) &&
    (!filter.location || locationId === Number(filter.location)) &&
    (!filter.branch || branchId === Number(filter.branch)) &&
    (!filter.department || row.departmentId === Number(filter.department)) &&
    (!filter.employee ||
      (row.assignedTo ?? row.employeeId) === Number(filter.employee)) &&
    `${row.assetCode || row.code || row.entityCode || ""} ${row.assetName || row.name || row.entityName || ""}`
      .toLocaleLowerCase("ar")
      .includes(filter.search.trim().toLocaleLowerCase("ar"))
  );
}
