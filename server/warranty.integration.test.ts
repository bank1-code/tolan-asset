import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { and, eq, inArray } from "drizzle-orm";
import crypto from "node:crypto";
import type { TrpcContext } from "./_core/context";
import {
  assets,
  users,
  warrantyReplacements,
  locations,
  branches,
  departments,
  employees,
  inventoryApprovalNumbers,
  archiveDocuments,
  auditLog,
} from "../drizzle/schema";
const state = vi.hoisted(() => ({ db: null as any }));
vi.mock("./db", () => ({ getDb: async () => state.db }));
import { warrantyRouter } from "./warrantyRouter";

// Requires explicit opt-in and a separately migrated database. No application-data fallback.
describe.skipIf(process.env.RUN_WARRANTY_DB_TESTS !== "1")(
  "Warranty transaction concurrency on an isolated database",
  () => {
    let pool: mysql.Pool, db: ReturnType<typeof drizzle>, ctx: TrpcContext;
    let locationId: number,
      branchId: number,
      departmentId: number,
      employeeId: number;
    const entityIds: number[] = [],
      requestIds: number[] = [];
    beforeAll(async () => {
      await import("dotenv/config");
      if (!process.env.TEST_DATABASE_URL)
        throw new Error(
          "TEST_DATABASE_URL must specify an isolated, migrated database."
        );
      const target = new URL(process.env.TEST_DATABASE_URL),
        current = process.env.DATABASE_URL
          ? new URL(process.env.DATABASE_URL)
          : null;
      if (
        current &&
        target.hostname === current.hostname &&
        (target.port || "3306") === (current.port || "3306") &&
        target.pathname === current.pathname
      )
        throw new Error(
          "Do not run warranty integration tests on the application database."
        );
      pool = mysql.createPool({
        uri: process.env.TEST_DATABASE_URL,
        ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
        connectionLimit: 4,
      });
      db = drizzle(pool);
      state.db = db;
      const [user] = await db.select().from(users).limit(1);
      if (!user) throw new Error("Seed one user in the test database.");
      ctx = {
        user: { ...user, role: "owner" },
        req: { headers: {}, ip: "127.0.0.1" },
        res: {},
      } as TrpcContext;
      const prefix = `WT-${crypto.randomUUID().slice(0, 8)}`;
      locationId = Number(
        (
          await db
            .insert(locations)
            .values({
              name: prefix,
              assetPrefix: `${prefix}-A`,
              custodyPrefix: `${prefix}-C`,
            })
        )[0].insertId
      );
      branchId = Number(
        (await db.insert(branches).values({ name: prefix, locationId }))[0]
          .insertId
      );
      departmentId = Number(
        (
          await db
            .insert(departments)
            .values({ name: prefix, locationId, branchId })
        )[0].insertId
      );
      employeeId = Number(
        (
          await db.insert(employees).values({ fullName: prefix, departmentId })
        )[0].insertId
      );
    });
    afterEach(async () => {
      if (!entityIds.length) return;
      if (requestIds.length) {
        const requests = await db
          .select()
          .from(warrantyReplacements)
          .where(inArray(warrantyReplacements.id, requestIds));
        for (const request of requests)
          if (request.replacementEntityId)
            entityIds.push(request.replacementEntityId);
        await db
          .delete(auditLog)
          .where(
            and(
              eq(auditLog.tableName, "warranty_replacements"),
              inArray(auditLog.recordId, requestIds)
            )
          );
        await db
          .delete(warrantyReplacements)
          .where(inArray(warrantyReplacements.id, requestIds));
      }
      await db
        .delete(auditLog)
        .where(
          and(
            eq(auditLog.tableName, "assets"),
            inArray(auditLog.recordId, entityIds)
          )
        );
      await db
        .delete(archiveDocuments)
        .where(inArray(archiveDocuments.assetId, entityIds));
      await db
        .delete(inventoryApprovalNumbers)
        .where(
          and(
            eq(inventoryApprovalNumbers.entityType, "asset"),
            inArray(inventoryApprovalNumbers.entityId, entityIds)
          )
        );
      await db.delete(assets).where(inArray(assets.id, entityIds));
      entityIds.length = 0;
      requestIds.length = 0;
    });
    afterAll(async () => {
      if (db) {
        if (employeeId)
          await db.delete(employees).where(eq(employees.id, employeeId));
        if (departmentId)
          await db.delete(departments).where(eq(departments.id, departmentId));
        if (branchId)
          await db.delete(branches).where(eq(branches.id, branchId));
        if (locationId)
          await db.delete(locations).where(eq(locations.id, locationId));
      }
      await pool?.end();
      state.db = null;
    });
    async function fixture() {
      const id = Number(
        (
          await db
            .insert(assets)
            .values({
              assetName: "Warranty concurrency fixture",
              assetCode: `WT-${crypto.randomUUID()}`,
              status: "ACTIVE",
              quantity: 3,
              assetValue: "100.00",
              assignedTo: employeeId,
              departmentId,
              locationId,
            })
        )[0].insertId
      );
      entityIds.push(id);
      return id;
    }
    async function request(entityId: number, suffix: string) {
      const api = warrantyRouter.createCaller(ctx);
      const saved = await api.saveDraft({
        request: {
          entityType: "asset",
          entityId,
          quantity: 2,
          provider: "Test warranty provider",
          claimReference: suffix,
          reason: "Test failure",
          incidentDate: "2026-10-01",
          effectiveDate: "2026-10-05",
          originalWarrantyStart: "2026-01-01",
          originalWarrantyEnd: "2027-01-01",
          warrantyPolicy: "continued",
          replacementWarrantyStart: "2026-01-01",
          replacementWarrantyEnd: "2027-01-01",
          originalSerialNumbers: [`OLD-${suffix}-1`, `OLD-${suffix}-2`],
          replacementSerialNumbers: [`NEW-${suffix}-1`, `NEW-${suffix}-2`],
          replacementName: "Replacement test device",
          documents: [{ name: "proof.pdf", url: "/api/files/test/proof.pdf" }],
          notes: "",
        },
      });
      requestIds.push(saved.id);
      await api.submit({ id: saved.id, expectedVersion: 0 });
      return { id: saved.id, expectedVersion: 1 };
    }
    it("two overlapping quantities commit once without creating excess stock", async () => {
      const entityId = await fixture(),
        first = await request(entityId, "A"),
        second = await request(entityId, "B"),
        api = warrantyRouter.createCaller(ctx);
      const results = await Promise.allSettled([
        api.execute(first),
        api.execute(second),
      ]);
      expect(
        results.filter(result => result.status === "fulfilled")
      ).toHaveLength(1);
      const [source] = await db
        .select()
        .from(assets)
        .where(eq(assets.id, entityId));
      expect(source.warrantyReplacedQuantity).toBe(2);
      const requests = await db
        .select()
        .from(warrantyReplacements)
        .where(inArray(warrantyReplacements.id, requestIds));
      expect(requests.filter(item => item.status === "EXECUTED")).toHaveLength(
        1
      );
    });
    it("replaying one request concurrently creates exactly one numbered replacement", async () => {
      const item = await request(await fixture(), "REPLAY"),
        api = warrantyRouter.createCaller(ctx);
      const results = await Promise.allSettled([
        api.execute(item),
        api.execute(item),
      ]);
      expect(
        results.filter(result => result.status === "fulfilled")
      ).toHaveLength(1);
      const [storedRequest] = await db
        .select()
        .from(warrantyReplacements)
        .where(eq(warrantyReplacements.id, item.id));
      const registry = await db
        .select()
        .from(inventoryApprovalNumbers)
        .where(
          and(
            eq(inventoryApprovalNumbers.entityType, "asset"),
            eq(inventoryApprovalNumbers.entityId, storedRequest.replacementEntityId!)
          )
        );
      expect(registry).toHaveLength(1);
    });
  }
);
