import { beforeAll, afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { and, eq, inArray } from "drizzle-orm";
import crypto from "node:crypto";
import type { TrpcContext } from "./_core/context";
import { assets, users, exclusionTypes, exclusionDrafts, assetExclusions, archiveDocuments, auditLog } from "../drizzle/schema";
const state = vi.hoisted(() => ({ db: null as any }));
vi.mock("./db", () => ({ getDb: async () => state.db }));
import { operationsRouter } from "./routers/operations";

// Explicit opt-in, isolated test database only. Never falls back to DATABASE_URL.
describe.skipIf(process.env.RUN_HISTORY_DB_TESTS !== "1")("Concurrent exclusion transactions on a test database", () => {
  let pool: mysql.Pool, db: ReturnType<typeof drizzle>, ctx: TrpcContext, typeId: number;
  const entityIds: number[] = [];
  beforeAll(async () => {
    await import("dotenv/config");
    if (!process.env.TEST_DATABASE_URL) throw new Error("Set TEST_DATABASE_URL to a migrated, isolated test database.");
    const target = new URL(process.env.TEST_DATABASE_URL), current = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
    if (current && target.hostname === current.hostname && (target.port || "3306") === (current.port || "3306") && target.pathname === current.pathname)
      throw new Error("TEST_DATABASE_URL must point to a different database than the application.");
    pool = mysql.createPool({ uri: process.env.TEST_DATABASE_URL, ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true }, connectionLimit: 4 });
    db = drizzle(pool); state.db = db;
    const [user] = await db.select().from(users).limit(1);
    if (!user) throw new Error("Seed one user in the test database first.");
    ctx = { user: { ...user, role: "owner" }, req: { headers: {}, ip: "127.0.0.1" }, res: {} } as TrpcContext;
    const result = await db.insert(exclusionTypes).values({ name: `History test ${crypto.randomUUID()}` }); typeId = Number(result[0].insertId);
  });
  afterEach(async () => {
    if (!entityIds.length) return;
    const operations = await db.select().from(assetExclusions).where(and(eq(assetExclusions.entityType,"asset"),inArray(assetExclusions.entityId,entityIds)));
    const archive = await db.select().from(archiveDocuments).where(inArray(archiveDocuments.assetId,entityIds));
    if (archive.length) await db.delete(auditLog).where(and(eq(auditLog.tableName,"archive_documents"),inArray(auditLog.recordId,archive.map(item=>item.id))));
    await db.delete(archiveDocuments).where(inArray(archiveDocuments.assetId,entityIds));
    if (operations.length) await db.delete(auditLog).where(and(eq(auditLog.tableName,"asset_exclusions"),inArray(auditLog.recordId,operations.map(item=>item.id))));
    const drafts = await db.select().from(exclusionDrafts).where(eq(exclusionDrafts.createdBy,ctx.user!.id));
    for (const draft of drafts) if(entityIds.includes(Number((draft.payload as any)?.entityId))) await db.delete(exclusionDrafts).where(eq(exclusionDrafts.id,draft.id));
    await db.delete(assetExclusions).where(and(eq(assetExclusions.entityType,"asset"),inArray(assetExclusions.entityId,entityIds)));
    await db.delete(assets).where(inArray(assets.id,entityIds)); entityIds.length=0;
  });
  afterAll(async () => { if(db && typeId) await db.delete(exclusionTypes).where(eq(exclusionTypes.id,typeId)); await pool?.end(); state.db=null; });
  async function fixture() {
    const result = await db.insert(assets).values({ assetName: "Concurrent history test", assetCode: `TEST-${crypto.randomUUID()}`, status:"ACTIVE",quantity:3,excludedQuantity:0,assetValue:"100.00" });
    const id=Number(result[0].insertId);entityIds.push(id);
    return { entityType:"asset" as const,entityId:id,quantityExcluded:2,exclusionTypeId:typeId,reason:"اختبار تزامن الاستبعاد",effectiveDate:"2026-10-06",responsibleData:[{job:"مدير",name:"مراجع الاختبار"}],exclusionImages:[] };
  }
  it("two competing quantities cannot exclude more than the actual remainder", async () => {
    const input=await fixture(), caller=operationsRouter.createCaller(ctx).exclusions;
    const first=await caller.saveDraft(input), second=await caller.saveDraft(input);
    const results=await Promise.allSettled([caller.create({...input,draftId:first.id}),caller.create({...input,draftId:second.id})]);
    expect(results.filter(result=>result.status==="fulfilled")).toHaveLength(1);
    const [entity]=await db.select().from(assets).where(eq(assets.id,input.entityId));expect(entity.excludedQuantity).toBe(2);
    const operations=await db.select().from(assetExclusions).where(and(eq(assetExclusions.entityType,"asset"),eq(assetExclusions.entityId,input.entityId)));
    expect(operations).toHaveLength(1);expect(operations[0].quantityRemaining).toBe(1);
    const archive=await db.select().from(archiveDocuments).where(eq(archiveDocuments.assetId,input.entityId));expect(archive).toHaveLength(1);
  });
  it("executing the same draft concurrently commits exactly once", async () => {
    const input=await fixture(), caller=operationsRouter.createCaller(ctx).exclusions,draft=await caller.saveDraft(input);
    const results=await Promise.allSettled([caller.create({...input,draftId:draft.id}),caller.create({...input,draftId:draft.id})]);
    expect(results.filter(result=>result.status==="fulfilled")).toHaveLength(1);
    const operations=await db.select().from(assetExclusions).where(and(eq(assetExclusions.entityType,"asset"),eq(assetExclusions.entityId,input.entityId)));
    expect(operations).toHaveLength(1);
  });
});
