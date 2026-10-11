import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  assets,
  custodyItems,
  departments,
  locations,
  branches,
  employees,
  warrantyReplacements,
} from "../drizzle/schema";
import { remainingQuantity } from "../shared/inventoryQuantity";
import {
  countItemKey,
  normalizeCountItems,
  type CountItem,
  type CountScope,
} from "../shared/inventoryCount";
import { parseHistoryData } from "./history";

const id = z.number().int().positive().optional();
export const countScopeSchema = z.object({
  sessionType: z.enum(["assets", "custody", "both"]),
  locationId: id,
  branchId: id,
  departmentId: id,
  employeeId: id,
  search: z.string().trim().max(200).optional(),
});
export async function collectCountScope(
  db: any,
  scope: CountScope,
  lock = false
) {
  const ls = await db.select().from(locations),
    bs = await db.select().from(branches),
    ds = await db.select().from(departments),
    es = await db.select().from(employees);
  const location = ls.find((row: any) => row.id === scope.locationId),
    branch = bs.find((row: any) => row.id === scope.branchId),
    department = ds.find((row: any) => row.id === scope.departmentId),
    employee = es.find((row: any) => row.id === scope.employeeId);
  if (
    (scope.locationId && !location) ||
    (scope.branchId && !branch) ||
    (scope.departmentId && !department) ||
    (scope.employeeId && !employee)
  )
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "أحد خيارات النطاق غير موجود؛ حدّث القوائم",
    });
  const departmentBranch = bs.find(
    (row: any) => row.id === department?.branchId
  );
  if (
    (branch && location && branch.locationId !== location.id) ||
    (department && branch && department.branchId !== branch.id) ||
    (department && location && departmentBranch?.locationId !== location.id)
  )
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "الفرع أو القسم لا يتبع النطاق المحدد",
    });
  const warranties = await db.select().from(warrantyReplacements);
  const items: CountItem[] = [];
  for (const kind of (scope.sessionType === "both"
    ? ["asset", "custody"]
    : scope.sessionType === "assets"
      ? ["asset"]
      : ["custody"]) as Array<"asset" | "custody">) {
    const table = kind === "asset" ? assets : custodyItems;
    const query = db.select().from(table).where(eq(table.status, "ACTIVE"));
    const records = await (lock ? query.for("update") : query);
    for (const row of records) {
      const d = ds.find((d: any) => d.id === row.departmentId),
        b = bs.find((b: any) => b.id === d?.branchId),
        l = ls.find((l: any) => l.id === row.locationId),
        e = es.find((e: any) => e.id === row.assignedTo);
      if (
        (scope.locationId && row.locationId !== scope.locationId) ||
        (scope.branchId && b?.id !== scope.branchId) ||
        (scope.departmentId && row.departmentId !== scope.departmentId) ||
        (scope.employeeId && row.assignedTo !== scope.employeeId) ||
        (scope.search &&
          !`${kind === "asset" ? row.assetCode : row.code} ${kind === "asset" ? row.assetName : row.name}`
            .toLocaleLowerCase("ar")
            .includes(scope.search.toLocaleLowerCase("ar"))) ||
        remainingQuantity(row) <= 0
      )
        continue;
      const known = parseHistoryData(row.serialNumbers);
      const retired = warranties
        .filter(
          (request: any) =>
            request.status === "EXECUTED" &&
            request.entityType === kind &&
            request.entityId === row.id
        )
        .flatMap(
          (request: any) =>
            parseHistoryData(request.payload)?.originalSerialNumbers || []
        );
      const serials = Array.isArray(known)
        ? known.filter(
            (serial: any) =>
              typeof serial === "string" && !retired.includes(serial)
          )
        : [];
      items.push({
        id: row.id,
        entityType: kind,
        code: (kind === "asset" ? row.assetCode : row.code) || "",
        name: kind === "asset" ? row.assetName : row.name,
        expectedQuantity: remainingQuantity(row),
        actualQuantity: null,
        reason: "",
        status: "pending",
        locationId: row.locationId,
        locationName: l?.name || null,
        branchId: b?.id || null,
        branchName: b?.name || null,
        departmentId: row.departmentId,
        departmentName: d?.name || null,
        employeeId: row.assignedTo,
        employeeName: e?.fullName || null,
        expectedSerialNumbers: serials,
        observedSerialNumbers: null,
        serialTrackingComplete:
          serials.length > 0 && serials.length === remainingQuantity(row),
        countedAt: null,
      });
    }
  }
  return {
    items,
    scope: {
      ...scope,
      locationName:
        (
          location ||
          ls.find(
            (row: any) =>
              row.id === (branch?.locationId ?? departmentBranch?.locationId)
          )
        )?.name || "جميع المواقع",
      branchName: branch?.name || departmentBranch?.name || null,
      departmentName: department?.name || null,
      employeeName: employee?.fullName || null,
      locationNameList: [
        ...new Set(items.map(item => item.locationName).filter(Boolean)),
      ],
      branchNameList: [
        ...new Set(items.map(item => item.branchName).filter(Boolean)),
      ],
      departmentNameList: [
        ...new Set(items.map(item => item.departmentName).filter(Boolean)),
      ],
      employeeNameList: [
        ...new Set(items.map(item => item.employeeName).filter(Boolean)),
      ],
    },
  };
}
export function overlappingCountSessions(sessions: any[], items: CountItem[]) {
  const keys = new Set(items.map(countItemKey));
  return sessions.filter(session => {
    if (!["DRAFT", "SUBMITTED"].includes(session.status)) return false;
    const data = parseHistoryData(session.items);
    const stored = Array.isArray(data)
      ? data
      : Array.isArray(data?.items)
        ? data.items
        : [];
    return normalizeCountItems(stored, session.sessionType).some(item =>
      keys.has(countItemKey(item))
    );
  });
}
