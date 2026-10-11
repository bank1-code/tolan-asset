import { describe, expect, it, vi } from "vitest";
import { InventoryAutosave } from "../client/src/lib/inventoryAutosave";
import { inventoryCountReport } from "../client/src/lib/inventoryCountReport";
import { filterCountRows } from "../client/src/components/InventoryListControls";
import { recoverCountEdits } from "../client/src/lib/inventoryRecovery";
import {
  emptyRecordFilters,
  matchesRecordFilters,
} from "../shared/recordFilters";
describe("Inventory UI persistence and reports", () => {
  it("filters warranty records by each independent scope, combined scope, kind and name or code", () => {
    const row = {
      id: 1,
      entityType: "custody",
      entityCode: "C100",
      entityName: "هاتف",
      locationId: 2,
      departmentId: 5,
      assignedTo: 8,
    };
    const departments = [{ id: 5, branchId: 3 }],
      branches = [{ id: 3, locationId: 2 }],
      base = emptyRecordFilters();
    for (const filter of [
      { location: "2" },
      { branch: "3" },
      { department: "5" },
      { employee: "8" },
      {
        type: "custody",
        employee: "8",
        location: "2",
        branch: "3",
        department: "5",
        search: "c100",
      },
      { search: "هاتف" },
    ])
      expect(
        matchesRecordFilters(row, { ...base, ...filter }, departments, branches)
      ).toBe(true);
    for (const filter of [
      { location: "1" },
      { branch: "1" },
      { department: "1" },
      { employee: "1" },
      { type: "asset" },
      { search: "مفقود" },
    ])
      expect(
        matchesRecordFilters(row, { ...base, ...filter }, departments, branches)
      ).toBe(false);
  });
  it("recovers local edits while retaining the authoritative frozen identity and quantity", () => {
    const baseline = [
      {
        id: 1,
        entityType: "asset",
        code: "A1",
        name: "أصل",
        expectedQuantity: 3,
        actualQuantity: null,
        reason: "",
        countedAt: null,
      },
    ] as any;
    const recovered = recoverCountEdits(baseline, [
      {
        ...baseline[0],
        code: "forged",
        expectedQuantity: 100,
        actualQuantity: 2,
        reason: "نقص",
        countedAt: "forged",
      },
    ]);
    expect(recovered?.[0]).toMatchObject({
      code: "A1",
      expectedQuantity: 3,
      actualQuantity: 2,
      reason: "نقص",
      countedAt: null,
    });
  });
  it("rejects local data belonging to a different session or containing invalid quantities", () => {
    const baseline = [
      { id: 1, entityType: "asset", actualQuantity: null },
    ] as any;
    expect(
      recoverCountEdits(baseline, [{ ...baseline[0], entityType: "custody" }])
    ).toBeNull();
    expect(recoverCountEdits(baseline, [])).toBeNull();
    expect(() =>
      recoverCountEdits(baseline, [{ ...baseline[0], actualQuantity: -1 }])
    ).toThrow();
  });
  it("serializes saves and preserves edits entered while a request is pending", async () => {
    let release!: (value: { version: number }) => void;
    const send = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            release = resolve;
          })
      )
      .mockResolvedValueOnce({ version: 2 });
    const saved = vi.fn(),
      failed = vi.fn(),
      engine = new InventoryAutosave<number[]>(0, send, saved, failed);
    engine.update([1]);
    const pending = engine.flush();
    engine.update([1, 2]);
    release({ version: 1 });
    await pending;
    expect(send).toHaveBeenNthCalledWith(2, [1, 2], 1, expect.any(String));
    expect(saved).toHaveBeenNthCalledWith(1, 1, false);
    expect(saved).toHaveBeenLastCalledWith(2, true);
    expect(engine.dirty).toBe(false);
    expect(failed).not.toHaveBeenCalled();
  });
  it("retries the same request key after a network failure before saving later edits", async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ version: 1 })
      .mockResolvedValueOnce({ version: 2 });
    const engine = new InventoryAutosave<string>(0, send, vi.fn(), vi.fn());
    engine.update("first");
    await engine.flush();
    engine.update("newer");
    await engine.flush();
    expect(send).toHaveBeenCalledTimes(1);
    await engine.flush(true);
    expect(send.mock.calls[0][2]).toBe(send.mock.calls[1][2]);
    expect(send.mock.calls[1][0]).toBe("first");
    expect(send.mock.calls[2][0]).toBe("newer");
    expect(engine.dirty).toBe(false);
  });
  it("does not overwrite server state after a version conflict", async () => {
    const failed = vi.fn(),
      send = vi.fn().mockRejectedValue(new Error("conflict"));
    const engine = new InventoryAutosave<string>(3, send, vi.fn(), failed);
    engine.update("local edit");
    await engine.flush();
    await engine.flush();
    expect(send).toHaveBeenCalledTimes(1);
    expect(engine.version).toBe(3);
    expect(engine.dirty).toBe(true);
    expect(failed).toHaveBeenCalled();
  });
  it("stops queued writes and callbacks when the session is closed", async () => {
    let release!: (value: { version: number }) => void;
    const saved = vi.fn(),
      send = vi.fn().mockImplementation(
        () =>
          new Promise(resolve => {
            release = resolve;
          })
      );
    const engine = new InventoryAutosave<number>(0, send, saved, vi.fn());
    engine.update(1);
    const pending = engine.flush();
    engine.update(2);
    engine.dispose();
    release({ version: 1 });
    await pending;
    expect(send).toHaveBeenCalledTimes(1);
    expect(saved).not.toHaveBeenCalled();
  });
  it("filters broad sessions by covered scope and dates without losing their mixed type", () => {
    const rows = [
      {
        sessionType: "both",
        status: "SUBMITTED",
        scope: {
          locationName: "جميع المواقع",
          locationNameList: ["الرياض", "جدة"],
          employeeNameList: ["أحمد"],
        },
        createdAt: new Date("2026-10-06T08:00:00Z"),
      },
    ];
    expect(
      filterCountRows(rows, {
        locationName: "الرياض",
        employeeName: "أحمد",
        type: "assets",
        status: "SUBMITTED",
        from: "2026-10-06",
        to: "2026-10-06",
      })
    ).toHaveLength(1);
    expect(filterCountRows(rows, { locationName: "غير موجود" })).toHaveLength(
      0
    );
  });
  it("prints the saved scope and quantities with escaped text and a differences-only view", () => {
    const session = {
      id: 1,
      sessionType: "both",
      status: "APPROVED",
      createdAt: new Date(),
      scope: { locationName: "<script>bad</script>" },
      performedByName: "المحاسب",
      approvedByName: "مدير الحسابات",
      items: [
        {
          id: 1,
          entityType: "asset",
          name: "<img onerror=x>",
          code: "A1",
          expectedQuantity: 2,
          actualQuantity: 1,
          reason: "نقص",
          countedAt: new Date().toISOString(),
        },
        {
          id: 1,
          entityType: "custody",
          name: "متطابق",
          code: "C1",
          expectedQuantity: 1,
          actualQuantity: 1,
        },
      ],
    };
    const report = inventoryCountReport(session);
    expect(report).toContain("&lt;img onerror=x&gt;");
    expect(report).not.toContain("<script>");
    expect(report).toContain("مدير الحسابات");
    expect(inventoryCountReport(session, true)).not.toContain("متطابق");
  });
});
