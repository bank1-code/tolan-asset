/**
 * API Hooks - ربط الواجهات بقاعدة البيانات عبر tRPC
 * يستبدل البيانات التجريبية بطلبات حقيقية
 */
import { trpc } from "./trpc";

// =============================================
// الإعدادات
// =============================================
export function useDepartments() {
  return trpc.settings.departments.list.useQuery();
}

export function useLocations() {
  return trpc.settings.locations.list.useQuery();
}

export function useEmployees() {
  return trpc.settings.employees.list.useQuery();
}

export function useExclusionTypes() {
  return trpc.settings.exclusionTypes.list.useQuery();
}

// =============================================
// الأصول
// =============================================
export function useAssets(filters?: {
  search?: string;
  departmentId?: number;
  locationId?: number;
  status?: string;
}) {
  return trpc.inventory.assets.list.useQuery(filters);
}

export function useAssetById(id: number) {
  return trpc.inventory.assets.getById.useQuery({ id }, { enabled: id > 0 });
}

export function useAssetStats() {
  return trpc.inventory.assets.stats.useQuery();
}

// =============================================
// العهد
// =============================================
export function useCustody(filters?: {
  search?: string;
  departmentId?: number;
  locationId?: number;
  status?: string;
}) {
  return trpc.inventory.custody.list.useQuery(filters);
}

export function useCustodyById(id: number) {
  return trpc.inventory.custody.getById.useQuery({ id }, { enabled: id > 0 });
}

export function useCustodyStats() {
  return trpc.inventory.custody.stats.useQuery();
}

// =============================================
// العمليات
// =============================================
export function useTransfers() {
  return trpc.operations.transfers.list.useQuery();
}

export function useExclusions() {
  return trpc.operations.exclusions.list.useQuery();
}

export function useNextExclusionCode() {
  return trpc.operations.exclusions.getNextCode.useQuery();
}

export function useClearanceRecords() {
  return trpc.operations.clearance.list.useQuery();
}

export function useNextClearanceCode() {
  return trpc.operations.clearance.getNextCode.useQuery();
}

export function useEmployeeItems(employeeId: number) {
  return trpc.operations.clearance.getEmployeeItems.useQuery(
    { employeeId },
    { enabled: employeeId > 0 }
  );
}

// =============================================
// السجلات
// =============================================
export function useArchive(filters?: { entityType?: string; search?: string }) {
  return trpc.records.archive.list.useQuery(filters);
}

export function useReports(filters?: {
  type?: "all" | "assets" | "custody";
  search?: string;
  employeeId?: number;
  departmentId?: number;
  locationId?: number;
  status?: string;
}) {
  return trpc.records.reports.inventory.useQuery(filters);
}

export function useDashboardStats() {
  return trpc.records.reports.dashboard.useQuery();
}

export function useAuditLog(filters?: {
  tableName?: string;
  actionType?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}) {
  return trpc.records.audit.list.useQuery(filters);
}

export function useAuditStats() {
  return trpc.records.audit.stats.useQuery();
}

// =============================================
// Mutations
// =============================================
export function useCreateDepartment() {
  return trpc.settings.departments.create.useMutation();
}

export function useUpdateDepartment() {
  return trpc.settings.departments.update.useMutation();
}

export function useDeleteDepartment() {
  return trpc.settings.departments.delete.useMutation();
}

export function useCreateLocation() {
  return trpc.settings.locations.create.useMutation();
}

export function useUpdateLocation() {
  return trpc.settings.locations.update.useMutation();
}

export function useDeleteLocation() {
  return trpc.settings.locations.delete.useMutation();
}

export function useCreateEmployee() {
  return trpc.settings.employees.create.useMutation();
}

export function useUpdateEmployee() {
  return trpc.settings.employees.update.useMutation();
}

export function useDeleteEmployee() {
  return trpc.settings.employees.delete.useMutation();
}

export function useCreateExclusionType() {
  return trpc.settings.exclusionTypes.create.useMutation();
}

export function useDeleteExclusionType() {
  return trpc.settings.exclusionTypes.delete.useMutation();
}

export function useCreateAsset() {
  return trpc.inventory.assets.create.useMutation();
}

export function useUpdateAsset() {
  return trpc.inventory.assets.update.useMutation();
}

export function useDeleteAsset() {
  return trpc.inventory.assets.delete.useMutation();
}

export function useCreateCustody() {
  return trpc.inventory.custody.create.useMutation();
}

export function useUpdateCustody() {
  return trpc.inventory.custody.update.useMutation();
}

export function useDeleteCustody() {
  return trpc.inventory.custody.delete.useMutation();
}

export function useCreateTransfer() {
  return trpc.operations.transfers.create.useMutation();
}

export function useCreateExclusion() {
  return trpc.operations.exclusions.create.useMutation();
}

export function useCreateClearance() {
  return trpc.operations.clearance.create.useMutation();
}

export function useCreateArchiveDocument() {
  return trpc.records.archive.create.useMutation();
}

export function useDeleteArchiveDocument() {
  return trpc.records.archive.delete.useMutation();
}

// =============================================
// Status Labels (ثوابت)
// =============================================
export const statusLabels: Record<string, { label: string; color: string }> = {
  ACTIVE: { label: "نشط", color: "bg-emerald-100 text-emerald-700" },
  EXCLUDED_PARTIAL: { label: "مستبعد جزئياً", color: "bg-amber-100 text-amber-700" },
  EXCLUDED_FULL: { label: "مستبعد كلياً", color: "bg-red-100 text-red-700" },
  EXCLUDED: { label: "مستبعد", color: "bg-red-100 text-red-700" },
};
