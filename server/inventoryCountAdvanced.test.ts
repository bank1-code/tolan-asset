import { beforeEach, describe, expect, it, vi } from "vitest";
import { transactionDatabase } from "./test-utils/transactionDatabase";
import type { TrpcContext } from "./_core/context";
const state = vi.hoisted(() => ({ db: null as any }));
vi.mock("./db", () => ({ getDb: async () => state.db }));
import { inventoryCountRouter } from "./routers/inventoryCount";
import { inventoryTimeline } from "./inventoryTimeline";
const caller = (role = "accountant", id = 2) =>
  inventoryCountRouter.createCaller({
    user: { id, name: role, role },
    req: { ip: "127.0.0.1", headers: {} },
    res: {},
  } as TrpcContext);
const scope = { sessionType: "both" as const, locationId: 1 };
beforeEach(() => {
  state.db = transactionDatabase({
    app_settings: [{ id: 1 }],
    locations: [
      { id: 1, name: "الرياض" },
      { id: 2, name: "جدة" },
    ],
    branches: [
      { id: 1, locationId: 1, name: "الأول" },
      { id: 2, locationId: 2, name: "الثاني" },
    ],
    departments: [
      { id: 1, name: "مالية", branchId: 1 },
      { id: 2, name: "إدارة", branchId: 2 },
    ],
    employees: [
      { id: 1, fullName: "أحمد" },
      { id: 2, fullName: "محمد" },
    ],
    assets: [
      {
        id: 1,
        assetCode: "A1",
        assetName: "أجهزة",
        quantity: 2,
        excludedQuantity: 0,
        warrantyReplacedQuantity: 0,
        status: "ACTIVE",
        departmentId: 1,
        locationId: 1,
        assignedTo: 1,
      },
      {
        id: 2,
        assetCode: "A2",
        assetName: "آخر",
        quantity: 3,
        excludedQuantity: 0,
        warrantyReplacedQuantity: 0,
        status: "ACTIVE",
        departmentId: 2,
        locationId: 2,
        assignedTo: 1,
      },
    ],
    custody_items: [
      {
        id: 1,
        code: "C1",
        name: "عهدة",
        quantity: 1,
        excludedQuantity: 0,
        warrantyReplacedQuantity: 0,
        status: "ACTIVE",
        departmentId: 1,
        locationId: 1,
        assignedTo: 2,
      },
    ],
    inventory_sessions: [],
    inventory_differences: [],
    inventory_difference_actions: [],
    audit_log: [],
    archive_documents: [],
    asset_transfers: [],
    asset_exclusions: [],
    warranty_replacements: [],
    exclusion_attachments: [],
  });
});
const create = (input = scope) => caller().createDraft(input);
const fullSave = async (draft: any, changes?: any) =>
  caller().saveDraft({
    id: draft.id,
    expectedVersion: draft.version,
    items: draft.items.map((item: any) => ({
      id: item.id,
      entityType: item.entityType,
      actualQuantity: item.expectedQuantity,
      reason: "",
      ...(changes || {}),
    })),
  });
const proof = [
  { name: "محضر.pdf", url: "/api/files/documents/inventory/proof.pdf" },
];
describe("Expanded count scopes and review lifecycle", () => {
  it("submits and approves only counted items, including explicit zero, without changing inventory", async () => {
    const draft = await create(),
      before = structuredClone(state.db.rows().assets);
    const saved = await caller().saveDraft({
      id: draft.id,
      expectedVersion: 0,
      items: draft.items.map(item => ({
        ...item,
        actualQuantity: item.entityType === "asset" ? 0 : null,
        reason: item.entityType === "asset" ? "لم يوجد الأصل أثناء الفحص" : "",
      })),
    });
    await caller().submitSession({
      id: draft.id,
      expectedVersion: saved.version,
    });
    const submitted = await caller("accounting_manager", 3).getSession({
      id: draft.id,
    });
    expect(submitted.items).toHaveLength(1);
    expect(submitted.items[0].actualQuantity).toBe(0);
    expect(submitted.scope.submissionSummary).toMatchObject({
      submittedCount: 1,
      unexaminedCount: 1,
    });
    expect((await caller().getSessions())[0].items).toHaveLength(1);
    await caller("accounting_manager", 3).approveSession({
      id: draft.id,
      expectedVersion: submitted.version,
    });
    expect(state.db.rows().inventory_differences).toHaveLength(1);
    expect(state.db.rows().archive_documents).toHaveLength(1);
    expect(
      (await inventoryTimeline(state.db, "custody", 1)).filter(
        row => row.actionType === "INVENTORY"
      )
    ).toHaveLength(0);
    expect(state.db.rows().assets).toEqual(before);
  });
  it("rejects an untouched submission and restores the full scope when returned for editing", async () => {
    const draft = await create();
    await expect(
      caller().submitSession({ id: draft.id, expectedVersion: 0 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const saved = await caller().saveDraft({
      id: draft.id,
      expectedVersion: 0,
      items: draft.items.map(item => ({
        ...item,
        actualQuantity:
          item.entityType === "asset" ? item.expectedQuantity : null,
      })),
    });
    const submitted = await caller().submitSession({
      id: draft.id,
      expectedVersion: saved.version,
    });
    const returned = await caller("accounting_manager", 3).returnSession({
      id: draft.id,
      expectedVersion: submitted.version,
      note: "استكمل فحص العهدة أيضًا",
    });
    const reopened = await caller().getSession({ id: draft.id });
    expect(reopened.items).toHaveLength(2);
    const first = await fullSave({ ...reopened, version: returned.version });
    const second = await fullSave({ ...reopened, version: first.version });
    expect(second.version).toBe(first.version + 1);
    await caller().submitSession({
      id: draft.id,
      expectedVersion: second.version,
    });
    expect((await caller().getSession({ id: draft.id })).items).toHaveLength(2);
  });
  it("searches scope by code or name with independent and combined filters", async () => {
    expect(
      (
        await caller().previewScope({ sessionType: "both", search: "a2" })
      ).items.map(item => item.code)
    ).toEqual(["A2"]);
    expect(
      (
        await caller().previewScope({
          sessionType: "both",
          search: "عهدة",
          departmentId: 1,
        })
      ).items
    ).toHaveLength(1);
    expect(
      (
        await caller().previewScope({
          sessionType: "both",
          employeeId: 1,
          branchId: 2,
          search: "آخر",
        })
      ).items
    ).toHaveLength(1);
  });
  it("returns the persisted start date without treating the whole site as a department", async () => {
    const draft = await create();
    expect(draft.createdAt).toEqual(
      state.db.rows().inventory_sessions[0].createdAt
    );
    expect(draft.createdAt).toBeTruthy();
    expect(draft.departmentName).toBeNull();
    expect(draft.scope.locationName).toBe("الرياض");
  });
  it("preview is read-only and scopes both kinds with colliding internal IDs", async () => {
    const before = structuredClone(state.db.rows());
    const result = await caller().previewScope(scope);
    expect(result.items.map(item => `${item.entityType}:${item.id}`)).toEqual([
      "asset:1",
      "custody:1",
    ]);
    expect(result.items[0]).toMatchObject({
      locationName: "الرياض",
      branchName: "الأول",
      employeeName: "أحمد",
      expectedQuantity: 2,
    });
    expect(state.db.rows()).toEqual(before);
  });
  it("combines employee and location filters and supports employee across sites", async () => {
    expect(
      (await caller().previewScope({ sessionType: "both", employeeId: 1 }))
        .items
    ).toHaveLength(2);
    expect(
      (await caller().previewScope({ ...scope, employeeId: 1 })).items
    ).toHaveLength(1);
    expect(
      (await caller().previewScope({ sessionType: "both", branchId: 2 }))
        .items[0].code
    ).toBe("A2");
    expect(
      (await caller().previewScope({ sessionType: "both", departmentId: 1 }))
        .items
    ).toHaveLength(2);
  });
  it("rejects conflicting hierarchy filters", async () => {
    for (const filter of [
      { ...scope, branchId: 2 },
      { ...scope, departmentId: 2 },
      { ...scope, branchId: 1, departmentId: 2 },
      { ...scope, employeeId: 99 },
    ])
      await expect(caller().previewScope(filter)).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
  });
  it("revalidates preview and refuses overlap without an explicit reason", async () => {
    await caller().previewScope(scope);
    const first = await create();
    await expect(create()).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await caller().previewScope(scope)).overlaps[0]).toMatchObject({
      id: first.id,
      canOpen: true,
    });
    const second = await caller().createDraft({
      ...scope,
      overlapReason: "جلسة تحقق مستقلة بتكليف موثق",
    });
    expect(second.id).not.toBe(first.id);
    await caller().cancelSession({
      id: first.id,
      expectedVersion: 0,
      note: "مسودة غير مطلوبة",
    });
    await caller().cancelSession({
      id: second.id,
      expectedVersion: 0,
      note: "إلغاء التحقق الإضافي",
    });
    expect((await caller().previewScope(scope)).overlaps).toEqual([]);
  });
  it("requires explicit kinds for IDs shared by assets and custody", async () => {
    const draft = await create();
    await expect(
      caller().saveDraft({
        id: draft.id,
        expectedVersion: 0,
        items: [
          { id: 1, actualQuantity: 2, reason: "" },
          { id: 1, actualQuantity: 1, reason: "" },
        ],
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const saved = await fullSave(draft);
    expect(saved.items.map(item => item.actualQuantity)).toEqual([2, 1]);
    const submitted = await caller().submitSession({
      id: draft.id,
      expectedVersion: saved.version,
    });
    await caller("accounting_manager", 3).approveSession({
      id: draft.id,
      expectedVersion: submitted.version,
    });
    expect(
      new Set(
        state.db.rows().archive_documents.map((doc: any) => doc.sourceKey)
      ).size
    ).toBe(2);
    expect(
      (await inventoryTimeline(state.db, "asset", 1)).filter(
        row => row.actionType === "INVENTORY"
      )
    ).toHaveLength(1);
    expect(
      (await inventoryTimeline(state.db, "custody", 1)).filter(
        row => row.actionType === "INVENTORY"
      )
    ).toHaveLength(1);
  });
  it("autosaves unfinished reasons but prevents submission until corrected", async () => {
    const draft = await create(),
      saved = await fullSave(draft, { actualQuantity: 0, reason: "" });
    await expect(
      caller().submitSession({ id: draft.id, expectedVersion: saved.version })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(state.db.rows().inventory_sessions[0].status).toBe("DRAFT");
    const corrected = await caller().saveDraft({
      id: draft.id,
      expectedVersion: saved.version,
      items: saved.items.map(item => ({
        ...item,
        reason: "لم توجد الوحدات أثناء الفحص",
      })),
    });
    const submitted = await caller().submitSession({
      id: draft.id,
      expectedVersion: corrected.version,
    });
    expect(submitted.status).toBe("SUBMITTED");
    await expect(
      caller().saveDraft({
        id: draft.id,
        expectedVersion: submitted.version,
        items: corrected.items,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller().approveSession({
        id: draft.id,
        expectedVersion: submitted.version,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("return notes unlock only the preparer's edits and resubmission", async () => {
    const draft = await create(),
      saved = await fullSave(draft),
      submitted = await caller().submitSession({
        id: draft.id,
        expectedVersion: saved.version,
      });
    const returned = await caller("accounting_manager", 3).returnSession({
      id: draft.id,
      expectedVersion: submitted.version,
      note: "أعد التحقق من هوية الجهاز",
    });
    expect((await caller().getSession({ id: draft.id })).reviewNote).toContain(
      "هوية الجهاز"
    );
    await expect(
      caller("accounting_manager", 3).saveDraft({
        id: draft.id,
        expectedVersion: returned.version,
        items: saved.items,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await caller().saveDraft({
      id: draft.id,
      expectedVersion: returned.version,
      items: saved.items,
    });
  });
  it("does not approve a draft directly and records cancellation without deletion", async () => {
    const draft = await create();
    await expect(
      caller("owner").approveSession({ id: draft.id, expectedVersion: 0 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await caller().cancelSession({
      id: draft.id,
      expectedVersion: 0,
      note: "إلغاء جلسة أنشئت بالنطاق الخطأ",
    });
    expect((await caller().getSessions())[0].status).toBe("CANCELLED");
    await expect(
      caller().saveDraft({
        id: draft.id,
        expectedVersion: 1,
        items: draft.items,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("replays a lost autosave response without a second write and detects a new conflicting edit", async () => {
    const draft = await create();
    const input = {
      id: draft.id,
      expectedVersion: 0,
      saveKey: "first-request",
      items: draft.items.map(item => ({
        ...item,
        actualQuantity: item.expectedQuantity,
      })),
    };
    const first = await caller().saveDraft(input),
      audits = state.db.rows().audit_log.length;
    expect(await caller().saveDraft(input)).toEqual(first);
    expect(state.db.rows().audit_log).toHaveLength(audits);
    await expect(
      caller().saveDraft({ ...input, saveKey: "other-editor" })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("records server count time, preserves it on note-only changes", async () => {
    const draft = await create(),
      first = await fullSave(draft);
    expect(first.items[0].countedAt).toBeTruthy();
    const second = await caller().saveDraft({
      id: draft.id,
      expectedVersion: first.version,
      items: first.items.map(item => ({ ...item, reason: "ملاحظة" })),
    });
    expect(second.items[0].countedAt).toBe(first.items[0].countedAt);
  });
  it("alerts for a movement even when current quantities and allocation match the baseline again", async () => {
    const draft = await create();
    state.db.rows().asset_transfers.push({
      id: 1,
      entityId: 1,
      entityType: "asset",
      transferredAt: new Date("2026-10-06"),
    });
    const changes = await caller().getSessionChanges({ id: draft.id });
    expect(changes[0].movementCount).toBe(1);
    expect(changes[0].currentQuantity).toBe(changes[0].expectedQuantity);
  });
  it("tracks unknown identities even when quantities agree", async () => {
    state.db.rows().assets[0].serialNumbers = ["S1", "S2"];
    const draft = await caller().createDraft({
      sessionType: "assets",
      departmentId: 1,
    });
    let saved = await fullSave(draft);
    await expect(
      caller().submitSession({ id: draft.id, expectedVersion: saved.version })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    saved = await caller().saveDraft({
      id: draft.id,
      expectedVersion: saved.version,
      items: [
        {
          ...saved.items[0],
          observedSerialNumbers: ["S1", "OTHER"],
          reason: "الجهاز الثاني مختلف عن المسجل",
        },
      ],
    });
    const submitted = await caller().submitSession({
      id: draft.id,
      expectedVersion: saved.version,
    });
    await caller("accounting_manager", 3).approveSession({
      id: draft.id,
      expectedVersion: submitted.version,
    });
    const differences = await caller("accounting_manager").getDifferences();
    expect(differences[0]).toMatchObject({
      difference: 0,
      identityMismatch: true,
      remainingQuantity: 1,
    });
  });
  it("rejects duplicate serials and inconsistent actual quantities before submission", async () => {
    state.db.rows().assets[0].serialNumbers = ["S1", "S2"];
    const draft = await caller().createDraft({
      sessionType: "assets",
      departmentId: 1,
    });
    await expect(
      caller().saveDraft({
        id: draft.id,
        expectedVersion: 0,
        items: [
          {
            ...draft.items[0],
            actualQuantity: 2,
            observedSerialNumbers: ["S1", "S1"],
          },
        ],
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const saved = await caller().saveDraft({
      id: draft.id,
      expectedVersion: 0,
      items: [
        { ...draft.items[0], actualQuantity: 2, observedSerialNumbers: ["S1"] },
      ],
    });
    await expect(
      caller().submitSession({ id: draft.id, expectedVersion: saved.version })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("uses documents for review closure and appends reopen history", async () => {
    const draft = await caller().createDraft({
        sessionType: "assets",
        departmentId: 1,
      }),
      saved = await fullSave(draft, {
        actualQuantity: 0,
        reason: "نقص تحت التحقق",
      }),
      submitted = await caller().submitSession({
        id: draft.id,
        expectedVersion: saved.version,
      });
    const manager = caller("accounting_manager", 3);
    await manager.approveSession({
      id: draft.id,
      expectedVersion: submitted.version,
    });
    const differenceId = (await manager.getDifferences())[0].id,
      original = structuredClone(state.db.rows().inventory_sessions[0]);
    const action = {
      differenceId,
      actionType: "REVIEW" as const,
      quantity: 2,
      note: "أثبت المحضر وجود الجهازين ولا حاجة إلى حركة أخرى",
    };
    await expect(manager.recordDifferenceAction(action)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await manager.recordDifferenceAction({ ...action, documents: proof });
    await expect(
      manager.recordDifferenceAction({
        differenceId,
        actionType: "REOPEN",
        quantity: 3,
        note: "التحقق من مستندات جديدة تتطلب إعادة المراجعة",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await manager.recordDifferenceAction({
      differenceId,
      actionType: "REOPEN",
      quantity: 1,
      note: "مستند لاحق يستوجب مراجعة إغلاق جزء من الفرق",
    });
    expect((await manager.getDifferences())[0]).toMatchObject({
      processingStatus: "IN_PROGRESS",
      remainingQuantity: 1,
    });
    expect(
      (await manager.getDifferenceActions({ differenceId })).map(
        row => row.quantity
      )
    ).toEqual([2, -1]);
    expect(state.db.rows().inventory_sessions[0]).toEqual(original);
  });
});
