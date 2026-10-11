import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { approvalProcedure } from "./_core/trpc";
import { getDb } from "./db";
import {
  inventoryDifferences,
  inventoryDifferenceActions,
  inventorySessions,
  assetTransfers,
  assetExclusions,
  assets,
  custodyItems,
  auditLog,
} from "../drizzle/schema";
import { parseHistoryData } from "./history";
import { isStoredImageUrl } from "../shared/imageUrls";

export const differenceWorkflowProcedures = {
  getDifferenceCandidates: approvalProcedure
    .input(z.object({ differenceId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [difference] = await db
        .select()
        .from(inventoryDifferences)
        .where(eq(inventoryDifferences.id, input.differenceId))
        .limit(1);
      if (!difference) throw new TRPCError({ code: "NOT_FOUND" });
      const transfers = await db
        .select()
        .from(assetTransfers)
        .where(eq(assetTransfers.entityId, difference.entityId));
      const exclusions = await db
        .select()
        .from(assetExclusions)
        .where(eq(assetExclusions.entityId, difference.entityId));
      const table = difference.entityType === "asset" ? assets : custodyItems;
      const additions =
        difference.difference > 0 ? await db.select().from(table) : [];
      return [
        ...transfers
          .filter(row => row.entityType === difference.entityType)
          .map(row => ({
            id: row.id,
            type: "TRANSFER",
            label: `نقل #${row.id}: ${row.fromDepartment || "—"} ← ${row.toDepartment || "—"}؛ الكمية ${row.quantity}`,
          })),
        ...exclusions
          .filter(
            row =>
              row.entityType === difference.entityType &&
              difference.difference < 0
          )
          .map(row => ({
            id: row.id,
            type: "EXCLUSION",
            label: `${row.exclusionCode}؛ الكمية ${row.quantityExcluded}`,
          })),
        ...additions
          .filter(
            row =>
              row.id !== difference.entityId &&
              row.approvedAt &&
              !["DRAFT", "CANCELLED"].includes(row.status)
          )
          .map(row => ({
            id: row.id,
            type: "ADDITION",
            label: `${"assetCode" in row ? row.assetCode : row.code} — ${"assetName" in row ? row.assetName : row.name}؛ الكمية ${row.quantity}`,
          })),
      ];
    }),
  getDifferenceActions: approvalProcedure
    .input(z.object({ differenceId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db
        .select()
        .from(inventoryDifferenceActions)
        .where(eq(inventoryDifferenceActions.differenceId, input.differenceId));
    }),
  recordDifferenceAction: approvalProcedure
    .input(
      z.object({
        differenceId: z.number().int().positive(),
        actionType: z.enum([
          "START",
          "TRANSFER",
          "EXCLUSION",
          "ADDITION",
          "REVIEW",
          "REOPEN",
        ]),
        quantity: z.number().int().min(0).max(2147483647),
        operationId: z.number().int().positive().optional(),
        documents: z
          .array(
            z.object({
              name: z.string().trim().min(1).max(255),
              url: z.string().refine(isStoredImageUrl, "رابط المستند غير صالح"),
            })
          )
          .max(20)
          .default([]),
        note: z
          .string()
          .trim()
          .min(20, "اكتب شرحًا موثقًا لا يقل عن 20 حرفًا")
          .max(4000),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db.transaction(async tx => {
        const [difference] = await tx
          .select()
          .from(inventoryDifferences)
          .where(eq(inventoryDifferences.id, input.differenceId))
          .limit(1)
          .for("update");
        if (!difference) throw new TRPCError({ code: "NOT_FOUND" });
        const [session] = await tx
          .select()
          .from(inventorySessions)
          .where(eq(inventorySessions.id, difference.sessionId))
          .limit(1);
        if (session?.status !== "APPROVED")
          throw new TRPCError({ code: "FORBIDDEN" });
        const actions = await tx
          .select()
          .from(inventoryDifferenceActions)
          .where(eq(inventoryDifferenceActions.differenceId, difference.id));
        const remaining =
          (difference.workQuantity ?? Math.abs(difference.difference)) -
          actions.reduce((sum, action) => sum + action.quantity, 0);
        const processed = actions.reduce(
          (sum, action) => sum + action.quantity,
          0
        );
        if (remaining <= 0 && input.actionType !== "REOPEN")
          throw new TRPCError({
            code: "CONFLICT",
            message: "الفرق مغلق بالكامل",
          });
        if (
          input.actionType === "REOPEN"
            ? input.quantity <= 0 || input.quantity > processed
            : input.actionType === "START"
              ? input.quantity !== 0
              : input.quantity <= 0 || input.quantity > remaining
        )
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "كمية المعالجة يجب ألا تتجاوز الجزء المفتوح من الفرق",
          });
        if (input.actionType === "REVIEW" && !input.documents.length)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "إغلاق المراجعة دون حركة يتطلب مستندًا أو محضرًا",
          });
        if (
          !difference.difference &&
          ["TRANSFER", "EXCLUSION", "ADDITION"].includes(input.actionType)
        )
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "فرق الهوية يحتاج مراجعة موثقة؛ لا تعالجه كفرق كمية",
          });
        const itemDepartmentId =
          parseHistoryData(difference.itemSnapshot)?.departmentId ??
          session.departmentId;
        let evidence: any = { documents: input.documents },
          operationKey: string | null = null;
        if (["TRANSFER", "EXCLUSION", "ADDITION"].includes(input.actionType)) {
          if (!input.operationId)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "رقم السجل الداخلي للعملية المنفذة مطلوب",
            });
          const table =
            input.actionType === "TRANSFER"
              ? assetTransfers
              : input.actionType === "EXCLUSION"
                ? assetExclusions
                : difference.entityType === "asset"
                  ? assets
                  : custodyItems;
          const [operation]: any[] = await tx
            .select()
            .from(table)
            .where(eq(table.id, input.operationId))
            .limit(1)
            .for("update");
          if (!operation)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "العملية غير موجودة",
            });
          const operationDate =
            input.actionType === "ADDITION"
              ? operation.approvedAt
              : input.actionType === "EXCLUSION"
                ? operation.exclusionDate
                : operation.transferredAt;
          if (
            !operationDate ||
            new Date(operationDate).getTime() <
              new Date(session.createdAt).getTime()
          )
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "اختر حركة منفذة منذ بدء الجرد؛ الحركات السابقة داخلة في الكمية المتوقعة",
            });
          if (input.actionType === "ADDITION") {
            if (
              difference.difference <= 0 ||
              operation.id === difference.entityId ||
              !operation.approvedAt ||
              ["DRAFT", "CANCELLED"].includes(operation.status) ||
              input.quantity > operation.quantity
            )
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "الزيادة تتطلب سجل إضافة آخر معتمدًا بكمية كافية",
              });
          } else {
            if (
              operation.entityType !== difference.entityType ||
              operation.entityId !== difference.entityId
            )
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "العملية لا تخص الأصل أو العهدة محل الفرق",
              });
            if (
              input.actionType === "EXCLUSION" &&
              (difference.difference >= 0 ||
                input.quantity > (operation.quantityExcluded || 0))
            )
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "الاستبعاد يعالج النقص فقط وبحد كمية العملية",
              });
            if (input.actionType === "TRANSFER") {
              const logs = await tx
                .select()
                .from(auditLog)
                .where(eq(auditLog.recordId, operation.id));
              const log = logs.find(
                row =>
                  row.tableName === "asset_transfers" &&
                  row.actionType === "TRANSFER"
              );
              const before = parseHistoryData(log?.oldData),
                after = parseHistoryData(log?.newData);
              const source = before?.departmentId,
                destination = after?.destination?.departmentId;
              const matchesDirection =
                difference.difference < 0
                  ? source === itemDepartmentId &&
                    destination !== itemDepartmentId &&
                    destination != null
                  : destination === itemDepartmentId &&
                    source !== itemDepartmentId &&
                    source != null;
              if (
                input.quantity > (operation.quantity || 0) ||
                !matchesDirection
              )
                throw new TRPCError({
                  code: "BAD_REQUEST",
                  message:
                    "اتجاه النقل أو كميته لا يناسب فرق القسم، أو لا توجد نسخة تاريخية تثبته",
                });
            }
          }
          operationKey = `${input.actionType}:${difference.entityType}:${operation.id}`;
          if (
            (
              await tx
                .select()
                .from(inventoryDifferenceActions)
                .where(
                  eq(inventoryDifferenceActions.operationKey, operationKey)
                )
                .limit(1)
            )[0]
          )
            throw new TRPCError({
              code: "CONFLICT",
              message:
                "رُبطت هذه العملية بمعالجة فرق سابقًا؛ لا يمكن احتسابها مرتين",
            });
          evidence.operationSnapshot = operation;
        } else if (input.operationId)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "هذا الإجراء لا يقبل رقم عملية",
          });
        const record = {
          differenceId: difference.id,
          actionType: input.actionType,
          quantity:
            input.actionType === "REOPEN" ? -input.quantity : input.quantity,
          operationKey,
          note: input.note,
          evidence,
          performedBy: ctx.user.id,
          performedByName: ctx.user.name,
        };
        const result = await tx
          .insert(inventoryDifferenceActions)
          .values(record);
        await tx.insert(auditLog).values({
          tableName: "inventory_differences",
          recordId: difference.id,
          // audit_log.actionType is varchar(20); keep this durable event code
          // within the existing storage contract rather than truncating it.
          actionType: "INVENTORY_REVIEW",
          actionDescription: `متابعة فرق الجرد #${difference.id}`,
          newData: { ...record, remaining: remaining - record.quantity },
          performedBy: ctx.user.id,
          performedByName: ctx.user.name,
          ipAddress: ctx.req.ip || null,
          userAgent: ctx.req.headers["user-agent"] || null,
        });
        return {
          id: Number(result[0].insertId),
          remaining: remaining - record.quantity,
        };
      });
    }),
};
