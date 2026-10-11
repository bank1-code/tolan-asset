import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { eq, and, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { assets, custodyItems, assetExclusions, exclusionDrafts, exclusionSequence, exclusionTypes, auditLog, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

const state = vi.hoisted(() => ({ db: null as any, failAudit: false }));
vi.mock("./db", () => ({ getDb: async () => state.db }));
import { appRouter } from "./routers";

// Explicit opt-in: every fixture and operation is rolled back after each test.
describe.skipIf(process.env.RUN_EXCLUSION_DB_TESTS !== "1")("Exclusion database transactions", () => {
  let pool: mysql.Pool;
  let db: ReturnType<typeof drizzle>;
  beforeAll(async () => {
    const { config } = await import("dotenv");
    config({ quiet: true });
    const target = process.env.TEST_DATABASE_URL;
    if (!target) throw new Error("TEST_DATABASE_URL must specify an isolated migrated database");
    if (process.env.DATABASE_URL && new URL(target).href === new URL(process.env.DATABASE_URL).href)
      throw new Error("Do not run integration tests on the application database");
    pool = mysql.createPool({ uri: target, ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true } });
    db = drizzle(pool);
  });
  afterAll(async () => { await pool?.end(); });

  async function isolated(run: (tx: any, caller: ReturnType<typeof appRouter.createCaller>, input: any) => Promise<void>, kind: "asset" | "custody" = "asset") {
    const rollback = new Error("ROLLBACK_TEST_FIXTURES");
    try {
      await db.transaction(async tx => {
        state.failAudit = false;
        state.db = new Proxy(tx, { get(target, key) {
          if (key === "transaction") return (callback: any) => target.transaction(inner => callback(new Proxy(inner, {
            get(target, key) {
              if (key === "insert" && state.failAudit) return (table: any) => {
                if (table === auditLog) throw new Error("Injected audit failure");
                return target.insert(table);
              };
              const value = Reflect.get(target, key);
              return typeof value === "function" ? value.bind(target) : value;
            },
          })));
          const value = Reflect.get(target, key);
          return typeof value === "function" ? value.bind(target) : value;
        }});
        const [user] = await tx.select({ id: users.id }).from(users).limit(1);
        if (!user) throw new Error("A seeded user is required");
        const result = await tx.insert(kind === "asset" ? assets : custodyItems).values(kind === "asset"
          ? { assetName: "Exclusion test snapshot", assetCode: "EXCLUSION-TEST", quantity: 10, excludedQuantity: 3, status: "ACTIVE" }
          : { name: "Exclusion test snapshot", code: "EXCLUSION-TEST", quantity: 10, excludedQuantity: 3, status: "ACTIVE" });
        const type = await tx.insert(exclusionTypes).values({ name: "Exclusion test type" });
        const ctx = { user: { id: user.id, name: "Exclusion test", role: "owner" }, req: { headers: {}, ip: "127.0.0.1" }, res: {} } as TrpcContext;
        const caller = appRouter.createCaller(ctx);
        const input = { entityType: kind, entityId: Number(result[0].insertId), exclusionMode: "partial",
          exclusionTypeId: Number(type[0].insertId), reason: "اختبار الاستبعاد", quantityExcluded: 2,
          effectiveDate: "2026-10-05", responsibleData: [{ job: "مدير", name: "مسؤول الاختبار" }], exclusionImages: [] };
        await run(tx, caller, input);
        throw rollback;
      });
    } catch (error) { if (error !== rollback) throw error; }
    finally { state.db = null; state.failAudit = false; }
  }

  for (const kind of ["asset", "custody"] as const) {
    it(`${kind}: snapshots, repeated partial exclusion, exhaustion and replay protection`, async () => {
      await isolated(async (tx, caller, input) => {
        const draft = await caller.operations.exclusions.saveDraft(input);
        const restored = await caller.operations.exclusions.drafts();
        expect(restored.find(r => r.id === draft.id)?.payload).toMatchObject({ effectiveDate: input.effectiveDate });
        const first = await caller.operations.exclusions.create({ ...input, draftId: draft.id });
        expect(first.record).toMatchObject({ originalQuantity: 10, previouslyExcluded: 3, quantityBefore: 7, quantityExcluded: 2, quantityRemaining: 5, entityName: "Exclusion test snapshot" });
        await expect(caller.operations.exclusions.create({ ...input, draftId: draft.id })).rejects.toMatchObject({ code: "CONFLICT" });
        const next = { ...input, quantityExcluded: 5 };
        const nextDraft = await caller.operations.exclusions.saveDraft(next);
        const second = await caller.operations.exclusions.create({ ...next, draftId: nextDraft.id });
        expect(second.record.quantityRemaining).toBe(0);
        expect(second.record.exclusionCode).not.toBe(first.record.exclusionCode);
        const table = kind === "asset" ? assets : custodyItems;
        const [entity] = await tx.select().from(table).where(eq(table.id, input.entityId));
        expect(entity).toMatchObject({ excludedQuantity: 10, status: "EXCLUDED" });
        const blocked = await caller.operations.exclusions.saveDraft(input);
        await expect(caller.operations.exclusions.create({ ...input, draftId: blocked.id })).rejects.toMatchObject({ code: "BAD_REQUEST" });
        const logs = await tx.select().from(auditLog).where(and(eq(auditLog.tableName, "asset_exclusions"), eq(auditLog.recordId, first.id)));
        expect(logs).toHaveLength(1);
        expect(logs[0].newData).toMatchObject({ effectiveDate: "2026-10-05", quantityRemaining: 5 });
      }, kind);
    }, 30000);
  }
  it("rejects quantity above actual remainder without consuming sequence or draft", async () => {
    await isolated(async (tx, caller, input) => {
      const bad = { ...input, quantityExcluded: 8 };
      const draft = await caller.operations.exclusions.saveDraft(bad);
      const before = await tx.select().from(exclusionSequence);
      await expect(caller.operations.exclusions.create({ ...bad, draftId: draft.id })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(await tx.select().from(exclusionSequence)).toEqual(before);
      expect(await tx.select().from(exclusionDrafts).where(eq(exclusionDrafts.id, draft.id))).toHaveLength(1);
      expect(await tx.select().from(assetExclusions).where(eq(assetExclusions.entityId, input.entityId))).toHaveLength(0);
    });
  }, 30000);
  it("full exclusion consumes only remainder and retains historical identity after rename", async () => {
    await isolated(async (tx, caller, input) => {
      const full = { ...input, exclusionMode: "full", quantityExcluded: 7 };
      const draft = await caller.operations.exclusions.saveDraft(full);
      const result = await caller.operations.exclusions.create({ ...full, draftId: draft.id });
      expect(result.record).toMatchObject({ quantityBefore: 7, quantityExcluded: 7, quantityRemaining: 0 });
      await tx.update(assets).set({ assetName: "Renamed" }).where(eq(assets.id, input.entityId));
      const [record] = await tx.select().from(assetExclusions).where(eq(assetExclusions.id, result.id));
      expect(record.entityName).toBe("Exclusion test snapshot");
      await expect(tx.insert(assetExclusions).values({ ...result.record })).rejects.toThrow();
    });
  }, 30000);
  it("audit failure rolls back inventory, exclusion, sequence and preserves draft", async () => {
    await isolated(async (tx, caller, input) => {
      const draft = await caller.operations.exclusions.saveDraft(input);
      const before = await tx.select().from(exclusionSequence);
      state.failAudit = true;
      await expect(caller.operations.exclusions.create({ ...input, draftId: draft.id })).rejects.toThrow("Injected audit failure");
      state.failAudit = false;
      const [entity] = await tx.select().from(assets).where(eq(assets.id, input.entityId));
      expect(entity.excludedQuantity).toBe(3);
      expect(await tx.select().from(assetExclusions).where(eq(assetExclusions.entityId, input.entityId))).toHaveLength(0);
      expect(await tx.select().from(exclusionSequence)).toEqual(before);
      expect(await tx.select().from(exclusionDrafts).where(eq(exclusionDrafts.id, draft.id))).toHaveLength(1);
    });
  }, 30000);
  it("cancel draft leaves inventory unchanged and invalid dates/fractions are rejected", async () => {
    await isolated(async (tx, caller, input) => {
      await expect(caller.operations.exclusions.saveDraft({ ...input, effectiveDate: "2026-02-30" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await expect(caller.operations.exclusions.saveDraft({ ...input, quantityExcluded: 1.5 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      const draft = await caller.operations.exclusions.saveDraft(input);
      await caller.operations.exclusions.deleteDraft({ id: draft.id });
      expect(await tx.select().from(exclusionDrafts).where(eq(exclusionDrafts.id, draft.id))).toHaveLength(0);
      const [entity] = await tx.select().from(assets).where(eq(assets.id, input.entityId));
      expect(entity.excludedQuantity).toBe(3);
    });
  }, 30000);
});
