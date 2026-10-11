import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { operatorProcedure, approvalProcedure } from "./_core/trpc";
import { getDb } from "./db";
import {
  assets,
  custodyItems,
  inventorySessions,
  inventoryDifferences,
  inventoryDifferenceActions,
  auditLog,
  appSettings,
  assetTransfers,
  assetExclusions,
  warrantyReplacements,
} from "../drizzle/schema";
import { canApprove } from "../shared/roles";
import {
  countItemKey,
  normalizeCountItems,
  serialDifference,
  validateCountForSubmission,
  itemsForSubmission,
  visibleCountItems,
  type CountItem,
} from "../shared/inventoryCount";
import {
  collectCountScope,
  countScopeSchema,
  overlappingCountSessions,
} from "./inventoryCountScope";
import { archiveEvent, parseHistoryData } from "./history";
import { differenceWorkflowProcedures } from "./inventoryDifferenceWorkflow";
import { remainingQuantity } from "../shared/inventoryQuantity";
export type { CountItem } from "../shared/inventoryCount";
export function sessionItems(value: unknown): any[] {
  const data = parseHistoryData(value);
  return Array.isArray(data)
    ? data
    : Array.isArray(data?.items)
      ? data.items
      : [];
}
async function database() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
  return db;
}
async function audit(
  tx: any,
  ctx: any,
  id: number,
  actionType: string,
  newData: any
) {
  await tx.insert(auditLog).values({
    tableName: "inventory_sessions",
    recordId: id,
    actionType,
    actionDescription: "جرد #" + id + ": " + actionType,
    newData,
    performedBy: ctx.user.id,
    performedByName: ctx.user.name,
    ipAddress: ctx.req.ip || null,
    userAgent: ctx.req.headers["user-agent"] || null,
  });
}
async function lockedSession(tx: any, id: number, ctx: any) {
  const [session] = await tx
    .select()
    .from(inventorySessions)
    .where(eq(inventorySessions.id, id))
    .limit(1)
    .for("update");
  if (!session) throw new TRPCError({ code: "NOT_FOUND" });
  if (
    !canApprove(ctx.user.role) &&
    session.performedBy !== ctx.user.id &&
    session.status !== "APPROVED"
  )
    throw new TRPCError({ code: "FORBIDDEN" });
  return session;
}
function checkVersion(session: any, version: number, status: string) {
  if (session.status !== status)
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "حالة الجلسة لا تسمح بهذه العملية",
    });
  if (session.version !== version)
    throw new TRPCError({
      code: "CONFLICT",
      message: "تغيرت الجلسة؛ حدّثها دون الكتابة فوق التعديلات الأحدث",
    });
}
function owner(session: any, ctx: any) {
  if (session.performedBy !== ctx.user.id)
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "المُعدّ وحده يعدل مسودته ويرسلها",
    });
}
const versionInput = z.object({
  id: z.number().int().positive(),
  expectedVersion: z.number().int().nonnegative(),
});
const noteInput = versionInput.extend({
  note: z.string().trim().min(5).max(4000),
});
export const countWorkflowProcedures = {
  ...differenceWorkflowProcedures,
  previewScope: operatorProcedure
    .input(countScopeSchema)
    .query(async ({ input, ctx }) => {
      const db = await database();
      const result = await collectCountScope(db, input);
      const sessions = await db.select().from(inventorySessions);
      return {
        ...result,
        overlaps: overlappingCountSessions(sessions, result.items).map(
          session => ({
            id: session.id,
            status: session.status,
            performedByName: session.performedByName,
            canOpen:
              canApprove(ctx.user.role) || session.performedBy === ctx.user.id,
          })
        ),
      };
    }),
  createDraft: operatorProcedure
    .input(
      countScopeSchema.extend({
        overlapReason: z.string().trim().max(4000).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await database();
      return db.transaction(async tx => {
        await tx
          .insert(appSettings)
          .values({ id: 1 })
          .onDuplicateKeyUpdate({ set: { id: 1 } });
        await tx
          .select()
          .from(appSettings)
          .where(eq(appSettings.id, 1))
          .limit(1)
          .for("update");
        const { overlapReason, ...filter } = input;
        const result = await collectCountScope(tx, filter, true);
        if (!result.items.length || result.items.some(item => !item.code))
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "لا توجد سجلات نشطة صالحة للجرد في النطاق",
          });
        const sessions = await tx
          .select()
          .from(inventorySessions)
          .for("update");
        const overlaps = overlappingCountSessions(sessions, result.items);
        if (overlaps.length && (!overlapReason || overlapReason.length < 10))
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "يوجد جرد مفتوح متداخل؛ استكمله أو اكتب سببًا لبدء جلسة أخرى (10 أحرف على الأقل)",
          });
        const record = {
          departmentId: input.departmentId ?? null,
          departmentName: result.scope.departmentName || null,
          scope: result.scope,
          overlapReason: overlapReason || null,
          sessionType: input.sessionType,
          status: "DRAFT",
          version: 0,
          totalCount: result.items.length,
          scannedCount: 0,
          missingCount: 0,
          items: result.items,
          performedBy: ctx.user.id,
          performedByName: ctx.user.name,
        };
        const inserted = await tx.insert(inventorySessions).values(record);
        const id = Number(inserted[0].insertId);
        await audit(tx, ctx, id, "INVENTORY_DRAFT", record);
        const [saved] = await tx
          .select()
          .from(inventorySessions)
          .where(eq(inventorySessions.id, id))
          .limit(1);
        return { ...record, id, createdAt: saved.createdAt };
      });
    }),
  saveDraft: operatorProcedure
    .input(
      versionInput.extend({
        saveKey: z.string().min(1).max(100).optional(),
        items: z
          .array(
            z.object({
              id: z.number().int().positive(),
              entityType: z.enum(["asset", "custody"]).optional(),
              actualQuantity: z
                .number()
                .int()
                .min(0)
                .max(2147483647)
                .nullable(),
              reason: z.string().trim().max(4000),
              observedSerialNumbers: z
                .array(z.string().trim().min(1).max(255))
                .max(10000)
                .nullable()
                .optional(),
            })
          )
          .min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await database();
      return db.transaction(async tx => {
        const session = await lockedSession(tx, input.id, ctx);
        owner(session, ctx);
        if (
          input.saveKey &&
          session.lastSaveKey === input.saveKey &&
          session.status === "DRAFT"
        )
          return {
            id: session.id,
            version: session.version,
            items: normalizeCountItems(
              sessionItems(session.items),
              session.sessionType
            ),
          };
        checkVersion(session, input.expectedVersion, "DRAFT");
        const stored = normalizeCountItems(
          sessionItems(session.items),
          session.sessionType
        );
        const mapped = input.items.map(current => {
          const candidates = stored.filter(
            item =>
              item.id === current.id &&
              (!current.entityType || item.entityType === current.entityType)
          );
          if (candidates.length !== 1)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "حدد نوع السجل وهويته الصحيحة",
            });
          return { ...current, entityType: candidates[0].entityType };
        });
        if (
          mapped.length !== stored.length ||
          new Set(mapped.map(countItemKey)).size !== stored.length
        )
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "يجب حفظ جميع عناصر الجلسة دون إضافة أو حذف",
          });
        const items = stored.map(old => {
          const current = mapped.find(
            item => countItemKey(item) === countItemKey(old)
          )!;
          const observedSerialNumbers =
            current.observedSerialNumbers === undefined
              ? (old.observedSerialNumbers ?? null)
              : current.observedSerialNumbers;
          if (
            observedSerialNumbers &&
            new Set(observedSerialNumbers).size !== observedSerialNumbers.length
          )
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "الأرقام التسلسلية المفحوصة مكررة",
            });
          const changed =
            current.actualQuantity !== old.actualQuantity ||
            JSON.stringify(observedSerialNumbers) !==
              JSON.stringify(old.observedSerialNumbers ?? null);
          return {
            ...old,
            ...current,
            observedSerialNumbers,
            countedAt:
              current.actualQuantity === null
                ? null
                : changed
                  ? new Date().toISOString()
                  : old.countedAt || new Date().toISOString(),
            status:
              current.actualQuantity === null
                ? ("pending" as const)
                : current.actualQuantity === 0
                  ? ("missing" as const)
                  : ("scanned" as const),
          };
        });
        const version = session.version + 1;
        await tx
          .update(inventorySessions)
          .set({
            items,
            version,
            lastSaveKey: input.saveKey || null,
            scannedCount: items.filter(item => item.actualQuantity !== null)
              .length,
            missingCount: items.filter(
              item =>
                item.actualQuantity !== null &&
                item.actualQuantity < item.expectedQuantity
            ).length,
          })
          .where(eq(inventorySessions.id, session.id));
        await audit(tx, ctx, session.id, "INVENTORY_DRAFT_EDIT", {
          items,
          version,
        });
        return { id: session.id, version, items };
      });
    }),
  submitSession: operatorProcedure
    .input(versionInput)
    .mutation(async ({ input, ctx }) => {
      const db = await database();
      return db.transaction(async tx => {
        const session = await lockedSession(tx, input.id, ctx);
        owner(session, ctx);
        checkVersion(session, input.expectedVersion, "DRAFT");
        const items = normalizeCountItems(
          sessionItems(session.items),
          session.sessionType
        );
        const error = validateCountForSubmission(items);
        if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error });
        const selected = itemsForSubmission(items);
        const submissionSummary = {
          submittedCount: selected.length,
          unexaminedCount: items.length - selected.length,
          scopeCount: items.length,
        };
        const version = session.version + 1;
        await tx
          .update(inventorySessions)
          .set({
            status: "SUBMITTED",
            submittedAt: new Date(),
            version,
            scope: { ...parseHistoryData(session.scope), submissionSummary },
          })
          .where(eq(inventorySessions.id, session.id));
        await audit(tx, ctx, session.id, "INVENTORY_SUBMIT", {
          items: selected,
          submissionSummary,
          version,
        });
        return { id: session.id, version, status: "SUBMITTED" as const };
      });
    }),
  returnSession: approvalProcedure
    .input(noteInput)
    .mutation(async ({ input, ctx }) => {
      const db = await database();
      return db.transaction(async tx => {
        const session = await lockedSession(tx, input.id, ctx);
        checkVersion(session, input.expectedVersion, "SUBMITTED");
        const version = session.version + 1;
        await tx
          .update(inventorySessions)
          .set({ status: "DRAFT", reviewNote: input.note, version })
          .where(eq(inventorySessions.id, session.id));
        await audit(tx, ctx, session.id, "INVENTORY_RETURN", {
          note: input.note,
          version,
        });
        return { id: session.id, version };
      });
    }),
  cancelSession: operatorProcedure
    .input(noteInput)
    .mutation(async ({ input, ctx }) => {
      const db = await database();
      return db.transaction(async tx => {
        const session = await lockedSession(tx, input.id, ctx);
        if (!canApprove(ctx.user.role)) owner(session, ctx);
        checkVersion(session, input.expectedVersion, "DRAFT");
        await tx
          .update(inventorySessions)
          .set({
            status: "CANCELLED",
            reviewNote: input.note,
            version: session.version + 1,
          })
          .where(eq(inventorySessions.id, session.id));
        await audit(tx, ctx, session.id, "INVENTORY_CANCEL", {
          note: input.note,
        });
        return { id: session.id };
      });
    }),
  approveSession: approvalProcedure
    .input(versionInput)
    .mutation(async ({ input, ctx }) => {
      const db = await database();
      return db.transaction(async tx => {
        const session = await lockedSession(tx, input.id, ctx);
        checkVersion(session, input.expectedVersion, "SUBMITTED");
        const items = normalizeCountItems(
          sessionItems(session.items),
          session.sessionType
        );
        const error = validateCountForSubmission(items);
        if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error });
        const approvedAt = new Date();
        await tx
          .update(inventorySessions)
          .set({
            status: "APPROVED",
            approvedBy: ctx.user.id,
            approvedByName: ctx.user.name,
            approvedAt,
            version: session.version + 1,
          })
          .where(eq(inventorySessions.id, session.id));
        let differences = 0;
        for (const item of itemsForSubmission(items)) {
          const difference = item.actualQuantity! - item.expectedQuantity,
            mismatch = serialDifference(item);
          if (difference || mismatch) {
            differences++;
            await tx.insert(inventoryDifferences).values({
              sessionId: session.id,
              entityType: item.entityType,
              entityId: item.id,
              code: item.code,
              name: item.name,
              expectedQuantity: item.expectedQuantity,
              actualQuantity: item.actualQuantity!,
              difference,
              reason: item.reason,
              itemSnapshot: item,
              identityMismatch: !!mismatch,
              workQuantity: Math.max(Math.abs(difference), mismatch),
            });
          }
          await archiveEvent(tx, ctx, {
            entityType: item.entityType,
            entityId: item.id,
            eventType: "INVENTORY",
            sourceKey:
              "inventory:" + session.id + ":" + item.entityType + ":" + item.id,
            inventorySessionId: session.id,
            newData: {
              ...item,
              difference,
              sessionType: session.sessionType,
              countedBy: session.performedByName,
              startedAt: session.createdAt,
              approvedByName: ctx.user.name,
              approvedAt,
            },
          });
        }
        await audit(tx, ctx, session.id, "INVENTORY", {
          ...session,
          status: "APPROVED",
          items: itemsForSubmission(items),
          approvedAt,
          approvedByName: ctx.user.name,
        });
        return { id: session.id, differences };
      });
    }),
  getSession: operatorProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const db = await database();
      const [session] = await db
        .select()
        .from(inventorySessions)
        .where(eq(inventorySessions.id, input.id))
        .limit(1);
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      if (
        session.status !== "APPROVED" &&
        !canApprove(ctx.user.role) &&
        session.performedBy !== ctx.user.id
      )
        throw new TRPCError({ code: "FORBIDDEN" });
      return {
        ...session,
        items: visibleCountItems(
          normalizeCountItems(sessionItems(session.items), session.sessionType),
          session.status,
          parseHistoryData(session.scope)
        ),
        scope: parseHistoryData(session.scope),
      };
    }),
  getSessionChanges: operatorProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const db = await database();
      const [session] = await db
        .select()
        .from(inventorySessions)
        .where(eq(inventorySessions.id, input.id))
        .limit(1);
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      if (
        session.status !== "APPROVED" &&
        !canApprove(ctx.user.role) &&
        session.performedBy !== ctx.user.id
      )
        throw new TRPCError({ code: "FORBIDDEN" });
      const items = visibleCountItems(
          normalizeCountItems(sessionItems(session.items), session.sessionType),
          session.status,
          parseHistoryData(session.scope)
        ),
        result = [];
      const assetRows = await db.select().from(assets),
        custodyRows = await db.select().from(custodyItems);
      const movements = [
        ...(await db.select().from(assetTransfers)).map(row => ({
          ...row,
          when: row.transferredAt,
        })),
        ...(await db.select().from(assetExclusions)).map(row => ({
          ...row,
          when: row.exclusionDate,
        })),
        ...(await db.select().from(warrantyReplacements))
          .filter(row => row.status === "EXECUTED")
          .map(row => ({ ...row, when: row.executedAt })),
      ];
      for (const item of items) {
        const record = (
          item.entityType === "asset" ? assetRows : custodyRows
        ).find(row => row.id === item.id);
        const occurred = movements.filter(
          row =>
            row.entityId === item.id &&
            row.entityType === item.entityType &&
            row.when &&
            new Date(row.when).getTime() >=
              new Date(session.createdAt).getTime() &&
            (!session.approvedAt ||
              new Date(row.when).getTime() <=
                new Date(session.approvedAt).getTime())
        );
        const changed =
          !record ||
          record.status !== "ACTIVE" ||
          remainingQuantity(record) !== item.expectedQuantity ||
          (item.departmentId !== undefined &&
            record.departmentId !== item.departmentId) ||
          (item.locationId !== undefined &&
            record.locationId !== item.locationId) ||
          (item.employeeId !== undefined &&
            record.assignedTo !== item.employeeId);
        if (changed || occurred.length)
          result.push({
            key: countItemKey(item),
            code: item.code,
            name: item.name,
            expectedQuantity: item.expectedQuantity,
            currentQuantity: record ? remainingQuantity(record) : null,
            currentStatus: record?.status || "غير موجود",
            movementCount: occurred.length,
            movementDates: occurred.map(row =>
              new Date(row.when!).toISOString()
            ),
            message: "حركة أو تغير منذ بدء الجرد؛ راجع توقيت الفحص",
          });
      }
      return result;
    }),
  getDifferences: approvalProcedure.query(async () => {
    const db = await database();
    const sessions = await db
      .select()
      .from(inventorySessions)
      .where(eq(inventorySessions.status, "APPROVED"));
    const rows = await db
      .select()
      .from(inventoryDifferences)
      .orderBy(desc(inventoryDifferences.createdAt));
    const actions = await db.select().from(inventoryDifferenceActions);
    return rows.flatMap(row => {
      const session = sessions.find(session => session.id === row.sessionId);
      if (!session) return [];
      const related = actions.filter(action => action.differenceId === row.id),
        processedQuantity = related.reduce(
          (sum, action) => sum + action.quantity,
          0
        );
      const workQuantity = row.workQuantity ?? Math.abs(row.difference),
        remainingQuantity = Math.max(0, workQuantity - processedQuantity),
        item = parseHistoryData(row.itemSnapshot);
      return [
        {
          ...row,
          itemSnapshot: item,
          ...{
            locationName:
              item?.locationName ||
              parseHistoryData(session.scope)?.locationName,
            branchName: item?.branchName,
            departmentId: item?.departmentId ?? session.departmentId,
            departmentName: item?.departmentName || session.departmentName,
            employeeName: item?.employeeName,
            performedByName: session.performedByName,
            approvedByName: session.approvedByName,
            countedAt: item?.countedAt || session.createdAt,
            approvedAt: session.approvedAt,
          },
          processedQuantity,
          workQuantity,
          remainingQuantity,
          processingStatus:
            remainingQuantity === 0
              ? "RESOLVED"
              : related.length
                ? "IN_PROGRESS"
                : "PENDING",
        },
      ];
    });
  }),
};
