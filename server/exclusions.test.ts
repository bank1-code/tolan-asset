import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import type { TrpcContext } from "./_core/context";

const state = vi.hoisted(() => ({ db: null as any }));
vi.mock("./db", () => ({ getDb: async () => state.db }));
vi.mock("./security", () => ({ logAuditAction: vi.fn() }));
import { operationsRouter } from "./routers/operations";
import { generateExclusionReport } from "../client/src/lib/exclusionReport";

// In-memory transactional adapter exercises the actual API handler without
// connecting to a database. The opt-in integration suite verifies SQL behavior.
function memoryDatabase() {
  let rows: Record<string, any[]> = { archive_documents: [], exclusion_attachments: [],
    assets: [{ id: 1, assetName: "اسم تاريخي", assetCode: "A1", quantity: 10, excludedQuantity: 3, status: "ACTIVE" }],
    custody_items: [{ id: 1, name: "عهدة تاريخية", code: "C1", quantity: 10, excludedQuantity: 3, status: "ACTIVE" }],
    exclusion_types: [{ id: 1, name: "تالف" }], exclusion_sequence: [], exclusion_drafts: [], asset_exclusions: [], audit_log: [],
  };
  const dialect = new MySqlDialect();
  let failAudit = false;
  const filter = (data: any[], condition: any) => {
    if (!condition) return data;
    const query = dialect.sqlToQuery(condition);
    const keys = Array.from(query.sql.matchAll(/`([^`]+)` = \?/g)).map(m => m[1]);
    return data.filter(row => keys.every((key, i) => row[key] === query.params[i]));
  };
  const db: any = {
    rows: () => rows,
    failAudit: () => { failAudit = true; },
    async transaction(callback: any) {
      const previous = structuredClone(rows);
      try { return await callback(db); } catch (error) { rows = previous; throw error; }
    },
    select: () => ({ from(table: any) {
      let condition: any;
      const query: any = {
        where(value: any) { condition = value; return query; },
        limit: () => query, for: () => query, orderBy: () => query,
        then(resolve: any, reject: any) { return Promise.resolve(structuredClone(filter(rows[getTableName(table)] || [], condition))).then(resolve, reject); },
      };
      return query;
    }}),
    insert: (table: any) => ({ values(value: any) {
      const name = getTableName(table);
      let upsert = false;
      const query: any = {
        onDuplicateKeyUpdate() { upsert = true; return query; },
        then(resolve: any, reject: any) {
          return Promise.resolve().then(() => {
            if (name === "audit_log" && failAudit) throw new Error("Audit unavailable");
            const existing = name === "exclusion_sequence" && rows[name].find(row => row.year === value.year);
            if (existing && upsert) { existing.seq++; return [{ insertId: existing.id }]; }
            if (name === "asset_exclusions" && rows[name].some(row => row.exclusionCode === value.exclusionCode)) throw new Error("Duplicate exclusion code");
            const id = Math.max(0, ...rows[name].map(row => row.id)) + 1;
            rows[name].push(structuredClone({ id, ...value }));
            return [{ insertId: id }];
          }).then(resolve, reject);
        },
      }; return query;
    }}),
    update: (table: any) => ({ set: (value: any) => ({ async where(condition: any) {
      for (const row of filter(rows[getTableName(table)], condition)) Object.assign(row, structuredClone(value));
    }}) }),
    delete: (table: any) => ({ async where(condition: any) {
      const name = getTableName(table), selected = filter(rows[name], condition);
      rows[name] = rows[name].filter(row => !selected.includes(row));
    }}),
  };
  return db;
}

describe("Exclusion execution and persistent drafts", () => {
  const ctx = { user: { id: 1, name: "مسؤول", role: "owner" }, req: { ip: "127.0.0.1", headers: {} }, res: {} } as TrpcContext;
  const payload = { entityType: "asset" as const, entityId: 1, exclusionMode: "partial" as const, exclusionTypeId: 1,
    reason: "تلف الجهاز", quantityExcluded: 2, effectiveDate: "2026-10-05", responsibleData: [{ job: "مدير", name: "محمد المسؤول" }], exclusionImages: [] };
  const caller = () => operationsRouter.createCaller(ctx).exclusions;
  beforeEach(() => { state.db = memoryDatabase(); });

  for (const entityType of ["asset", "custody"] as const) {
    it(`${entityType}: refuses exclusion of drafts and cancelled drafts without allocating a number`, async () => {
      const input = { ...payload, entityType };
      const draft = await caller().saveDraft(input);
      const row = state.db.rows()[entityType === "asset" ? "assets" : "custody_items"][0];
      for (const status of ["DRAFT", "CANCELLED"]) {
        row.status = status;
        await expect(caller().create({ ...input, draftId: draft.id })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      }
      expect(state.db.rows().asset_exclusions).toHaveLength(0);
      expect(state.db.rows().exclusion_sequence).toHaveLength(0);
    });
  }

  for (const entityType of ["asset", "custody"] as const) {
    it(`${entityType}: calculates actual remainder and consumes the draft once`, async () => {
      const input = { ...payload, entityType };
      const draft = await caller().saveDraft(input);
      expect(state.db.rows().exclusion_sequence).toHaveLength(0);
      const result = await caller().create({ ...input, draftId: draft.id });
      expect(result.record).toMatchObject({ originalQuantity: 10, previouslyExcluded: 3, quantityBefore: 7, quantityExcluded: 2, quantityRemaining: 5, effectiveDate: payload.effectiveDate });
      expect(state.db.rows().audit_log).toHaveLength(1);
      expect(state.db.rows().exclusion_drafts).toHaveLength(0);
      await expect(caller().create({ ...input, draftId: draft.id })).rejects.toMatchObject({ code: "CONFLICT" });
      expect(state.db.rows().asset_exclusions).toHaveLength(1);
    });
  }
  it("rejects over-exclusion and retains the draft and all quantities", async () => {
    const input = { ...payload, quantityExcluded: 8 };
    const draft = await caller().saveDraft(input);
    await expect(caller().create({ ...input, draftId: draft.id })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(state.db.rows().assets[0].excludedQuantity).toBe(3);
    expect(state.db.rows().asset_exclusions).toHaveLength(0);
    expect(state.db.rows().exclusion_sequence).toHaveLength(0);
    expect(state.db.rows().exclusion_drafts).toHaveLength(1);
  });
  it("full exclusion excludes only the remaining quantity", async () => {
    const input = { ...payload, exclusionMode: "full" as const, quantityExcluded: 7 };
    const draft = await caller().saveDraft(input);
    const result = await caller().create({ ...input, draftId: draft.id });
    expect(result.record.quantityExcluded).toBe(7);
    expect(state.db.rows().assets[0]).toMatchObject({ excludedQuantity: 10, status: "EXCLUDED" });
  });
  it("derives partial or full from the entered quantity regardless of a legacy mode", async () => {
    const input = { ...payload, exclusionMode: "full" as const, quantityExcluded: 2 };
    const draft = await caller().saveDraft(input);
    const result = await caller().create({ ...input, draftId: draft.id });
    expect(result.record).toMatchObject({ exclusionMode: "partial", quantityExcluded: 2, quantityRemaining: 5 });
    expect(state.db.rows().assets[0]).toMatchObject({ excludedQuantity: 5, status: "ACTIVE" });
  });
  it("successive partial exclusions exhaust the record and produce different codes", async () => {
    const draft = await caller().saveDraft(payload);
    const first = await caller().create({ ...payload, draftId: draft.id });
    const input = { ...payload, quantityExcluded: 5 };
    const next = await caller().saveDraft(input);
    const second = await caller().create({ ...input, draftId: next.id });
    expect(second.record.exclusionCode).not.toBe(first.record.exclusionCode);
    expect(state.db.rows().assets[0].status).toBe("EXCLUDED");
    const blocked = await caller().saveDraft(payload);
    await expect(caller().create({ ...payload, draftId: blocked.id })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("audit failure aborts the entire operation including the number", async () => {
    const draft = await caller().saveDraft(payload);
    const before = structuredClone(state.db.rows());
    state.db.failAudit();
    await expect(caller().create({ ...payload, draftId: draft.id })).rejects.toThrow("Audit unavailable");
    expect(state.db.rows()).toEqual(before);
  });
  it("preserves historical name and code after inventory changes", async () => {
    const draft = await caller().saveDraft(payload);
    await caller().create({ ...payload, draftId: draft.id });
    Object.assign(state.db.rows().assets[0], { assetName: "اسم جديد", assetCode: "A2" });
    expect((await caller().list())[0]).toMatchObject({ entityName: "اسم تاريخي", entityCode: "A1" });
  });
  it("saved drafts survive new callers and can be updated or canceled without inventory effects", async () => {
    const draft = await caller().saveDraft(payload);
    expect((await caller().drafts())[0].payload).toMatchObject({ reason: payload.reason });
    await caller().saveDraft({ ...payload, draftId: draft.id, reason: "سبب جديد" });
    expect(state.db.rows().exclusion_drafts).toHaveLength(1);
    await caller().deleteDraft({ id: draft.id });
    expect(await caller().drafts()).toHaveLength(0);
    expect(state.db.rows().assets[0].excludedQuantity).toBe(3);
    expect(state.db.rows().exclusion_sequence).toHaveLength(0);
  });
  it("rejects execution of changed or another user's draft", async () => {
    const draft = await caller().saveDraft(payload);
    await expect(caller().create({ ...payload, draftId: draft.id, quantityExcluded: 3 })).rejects.toMatchObject({ code: "CONFLICT" });
    const other = operationsRouter.createCaller({ ...ctx, user: { ...ctx.user!, id: 2 } }).exclusions;
    await expect(other.create({ ...payload, draftId: draft.id })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(other.saveDraft({ ...payload, draftId: draft.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(state.db.rows().assets[0].excludedQuantity).toBe(3);
  });
  it("requires a real date and integer quantity", async () => {
    await expect(caller().saveDraft({ ...payload, effectiveDate: "2026-02-30" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller().saveDraft({ ...payload, quantityExcluded: 1.5 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("allows a planned draft but refuses future execution without changing data or allocating a number", async () => {
    const input = { ...payload, effectiveDate: "2099-12-31" };
    const draft = await caller().saveDraft(input);
    const before = structuredClone(state.db.rows());
    await expect(caller().create({ ...input, draftId: draft.id })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(state.db.rows()).toEqual(before);
  });
  it("saves and executes drafts with the relative image URL returned by IDrive", async () => {
    const image = "/api/files/images/exclusion/exclusion-123.webp";
    const input = { ...payload, exclusionImages: [image] };
    const draft = await caller().saveDraft(input);
    expect((await caller().drafts())[0].payload).toMatchObject({ exclusionImages: [image] });
    const result = await caller().create({ ...input, draftId: draft.id });
    expect(result.record.exclusionImages).toEqual([image]);
    const html = generateExclusionReport({ ...result.record, entityName: result.record.entityName!, entityCode: result.record.entityCode!,
      exclusionDate: result.record.exclusionDate.toISOString(), responsibles: input.responsibleData, images: [image] });
    expect(html).toContain(`src="${image}"`);
  });
  it("also accepts absolute HTTP storage URLs", async () => {
    const images = ["https://storage.example.com/image.webp?signature=abc", "http://localhost:3000/image.webp"];
    const draft = await caller().saveDraft({ ...payload, exclusionImages: images });
    expect((await caller().drafts()).find(d => d.id === draft.id)?.payload).toMatchObject({ exclusionImages: images });
  });
  it.each(["images/exclusion/image.webp", "//other.example/image.webp", "/api/files/", "/api/files/%2e%2e/image.webp", "/api/files/%5c/image.webp", "javascript:alert(1)", "blob:https://example.com/image", "data:image/png;base64,AAAA"])("rejects an invalid persisted image reference: %s", async image => {
    await expect(caller().saveDraft({ ...payload, exclusionImages: [image] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(state.db.rows().exclusion_drafts).toHaveLength(0);
  });
});
