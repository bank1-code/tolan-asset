import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  locations,
  branches,
  departments,
  appSettings,
} from "../drizzle/schema";
import { normalizeNumberPrefix, isValidNumberPrefix } from "./numbering";

// Shared by manual creation and Excel import; counters are always allocated in the caller's transaction.
export async function createHierarchyRecord(
  tx: any,
  type: "locations" | "branches" | "departments",
  input: {
    name: string;
    locationId?: number;
    branchId?: number;
    assetPrefix?: string | null;
    custodyPrefix?: string | null;
  }
) {
  if (type === "locations") {
    const assetPrefix = normalizeNumberPrefix(input.assetPrefix),
      custodyPrefix = normalizeNumberPrefix(input.custodyPrefix);
    for (const [column, prefix] of [
      [locations.assetPrefix, assetPrefix],
      [locations.custodyPrefix, custodyPrefix],
    ] as const) {
      if (prefix && (prefix.length > 40 || !isValidNumberPrefix(prefix)))
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "البادئة غير صالحة؛ استخدم أحرفًا وأرقامًا وشرطات بحد أقصى 40 حرفًا",
        });
      if (
        prefix &&
        (
          await tx.select().from(locations).where(eq(column, prefix)).limit(1)
        )[0]
      )
        throw new TRPCError({
          code: "CONFLICT",
          message: "البادئة مستخدمة في موقع آخر",
        });
    }
    await tx
      .insert(appSettings)
      .values({ id: 1 })
      .onDuplicateKeyUpdate({ set: { id: 1 } });
    const [settings] = await tx
      .select()
      .from(appSettings)
      .where(eq(appSettings.id, 1))
      .limit(1)
      .for("update");
    let sequence = Number(settings?.locationSequence || 0) + 1;
    let code = String(sequence).padStart(2, "0");
    while (
      (
        await tx
          .select()
          .from(locations)
          .where(eq(locations.code, code))
          .limit(1)
      )[0]
    )
      code = String(++sequence).padStart(2, "0");
    await tx
      .update(appSettings)
      .set({ locationSequence: sequence })
      .where(eq(appSettings.id, 1));
    const record = { name: input.name, code, assetPrefix, custodyPrefix };
    const inserted = await tx.insert(locations).values(record);
    return { ...record, id: Number(inserted[0].insertId) };
  }
  const parentTable = type === "branches" ? locations : branches,
    parentId = type === "branches" ? input.locationId : input.branchId;
  const [parent] = await tx
    .select()
    .from(parentTable)
    .where(eq(parentTable.id, parentId!))
    .limit(1)
    .for("update");
  if (!parent?.code)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        type === "branches"
          ? "الموقع غير موجود أو لا يملك كودًا"
          : "الفرع غير موجود أو لا يملك كودًا",
    });
  const table = type === "branches" ? branches : departments,
    counter = type === "branches" ? "branchSequence" : "departmentSequence";
  let sequenceNo = Number(parent[counter] || 0) + 1,
    code = `${parent.code}-${String(sequenceNo).padStart(type === "branches" ? 2 : 3, "0")}`;
  while (
    (await tx.select().from(table).where(eq(table.code, code)).limit(1))[0]
  )
    code = `${parent.code}-${String(++sequenceNo).padStart(type === "branches" ? 2 : 3, "0")}`;
  await tx
    .update(parentTable)
    .set({ [counter]: sequenceNo })
    .where(eq(parentTable.id, parent.id));
  const record =
    type === "branches"
      ? { name: input.name, code, sequenceNo, locationId: parent.id }
      : {
          name: input.name,
          code,
          sequenceNo,
          branchId: parent.id,
          locationId: parent.locationId,
        };
  const inserted = await tx.insert(table).values(record as any);
  return { ...record, id: Number(inserted[0].insertId) };
}
