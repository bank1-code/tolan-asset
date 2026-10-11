export const ROLES = [
  "owner",
  "admin",
  "accounting_manager",
  "accountant",
  "employee",
] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABELS: Record<Role, string> = {
  owner: "المالك",
  admin: "مدير النظام",
  accounting_manager: "مدير الحسابات",
  accountant: "المحاسب",
  employee: "الموظف",
};
export const APPROVER_ROLES: Role[] = ["owner", "admin", "accounting_manager"];
export const OPERATOR_ROLES: Role[] = [...APPROVER_ROLES, "accountant"];
export const canApprove = (role?: string | null) =>
  APPROVER_ROLES.includes(role as Role);
export const canOperate = (role?: string | null) =>
  OPERATOR_ROLES.includes(role as Role);
