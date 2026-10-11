import { it, vi } from "vitest";
import express from "express";
import path from "node:path";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { transactionDatabase } from "../server/test-utils/transactionDatabase";
const fixture = vi.hoisted(() => ({
  db: null as any,
  files: new Map<string, { bytes: Buffer; type: string }>(),
}));
vi.mock("../server/db", () => ({ getDb: async () => fixture.db }));
vi.mock("../server/security", () => ({ logAuditAction: vi.fn() }));
vi.mock("../server/storage", () => ({
  storagePut: async (key: string, bytes: Buffer, type: string) => {
    fixture.files.set(key, { bytes, type });
    return { key, url: `/api/files/${key}` };
  },
}));
import { appRouter } from "../server/routers";

// Isolated, loopback-only UI fixture. It never connects to DATABASE_URL or remote storage.
it.skipIf(process.env.RUN_INVENTORY_UI_FIXTURE !== "1")(
  "interactive inventory browser fixture",
  async () => {
    fixture.db = transactionDatabase({
      app_settings: [
        {
          id: 1,
          systemName: "اختبار الجرد المعزول",
          systemSubtitle: "بيانات محاكاة",
        },
      ],
      locations: [
        { id: 1, code: "01", name: "الرياض" },
        { id: 2, code: "02", name: "جدة" },
      ],
      branches: [
        { id: 1, code: "01-01", name: "الرئيسي", locationId: 1 },
        { id: 2, code: "02-01", name: "الغربي", locationId: 2 },
      ],
      departments: [
        {
          id: 1,
          code: "01-01-001",
          name: "المالية",
          branchId: 1,
          locationId: 1,
        },
        {
          id: 2,
          code: "02-01-001",
          name: "الإدارة",
          branchId: 2,
          locationId: 2,
        },
      ],
      employees: [
        { id: 1, code: "01-01-001-0001", fullName: "أحمد", departmentId: 1 },
        { id: 2, code: "02-01-001-0001", fullName: "محمد", departmentId: 2 },
      ],
      assets: [
        {
          id: 1,
          assetCode: "A1",
          assetName: "شاشات",
          quantity: 3,
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
          assetName: "حواسيب",
          quantity: 2,
          excludedQuantity: 0,
          warrantyReplacedQuantity: 0,
          status: "ACTIVE",
          departmentId: 2,
          locationId: 2,
          assignedTo: 2,
        },
      ],
      custody_items: [
        {
          id: 1,
          code: "C1",
          name: "هاتف",
          quantity: 1,
          excludedQuantity: 0,
          warrantyReplacedQuantity: 0,
          status: "ACTIVE",
          departmentId: 1,
          locationId: 1,
          assignedTo: 1,
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
      users: [],
    });
    fixture.db.execute = async () => [[], []];
    const app = express();
    app.use(express.json({ limit: "50mb" }));
    let finish!: () => void;
    const done = new Promise<void>(resolve => {
      finish = resolve;
    });
    app.get("/__fixture/role/:role", (req, res) => {
      const role = [
        "accountant",
        "accounting_manager",
        "admin",
        "owner",
      ].includes(req.params.role)
        ? req.params.role
        : "accountant";
      res.cookie("fixture_role", role);
      res.redirect("/inventory-count");
    });
    app.post("/__fixture/stop", (_, res) => {
      res.json({
        stopped: true,
        sessions: fixture.db.rows().inventory_sessions.length,
        differences: fixture.db.rows().inventory_differences.length,
      });
      finish();
    });
    app.get("/__fixture/state", (_, res) =>
      res.json({
        sessions: fixture.db.rows().inventory_sessions,
        differences: fixture.db.rows().inventory_differences,
      })
    );
    app.get("/api/files/*", (req, res) => {
      const file = fixture.files.get(req.path.slice("/api/files/".length));
      if (!file) {
        res.status(404).end();
        return;
      }
      res.type(file.type).send(file.bytes);
    });
    app.use(
      "/api/trpc",
      createExpressMiddleware({
        router: appRouter,
        createContext: ({ req, res }) => {
          const match =
            /fixture_role=(accountant|accounting_manager|owner|admin)/.exec(
              req.headers.cookie || ""
            );
          const role = match?.[1] || "accountant";
          return {
            req,
            res,
            user: {
              id: role === "accountant" ? 2 : 3,
              role,
              name:
                role === "accountant"
                  ? "محاسب الاختبار"
                  : "مدير حسابات الاختبار",
              username: role,
            } as any,
          };
        },
      })
    );
    app.use(express.static(path.resolve("dist/public")));
    app.get("*", (_, res) =>
      res.sendFile(path.resolve("dist/public/index.html"))
    );
    const server = app.listen(3217, "127.0.0.1", () =>
      console.log(
        "Isolated inventory UI ready: http://127.0.0.1:3217/inventory-count"
      )
    );
    try {
      await done;
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  },
  600000
);
