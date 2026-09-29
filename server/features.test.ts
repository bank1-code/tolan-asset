import { describe, expect, it, vi, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

// ==========================================
// Helper: إنشاء سياق مستخدم مصادق
// ==========================================
function createMockContext(overrides?: Partial<User>): TrpcContext {
  const cookies: Record<string, unknown>[] = [];

  const user: User = {
    id: 1,
    openId: "local_admin_test",
    username: "admin",
    passwordHash: "$2a$10$test",
    name: "سوبر أدمن",
    email: null,
    loginMethod: "local",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
      ip: "127.0.0.1",
    } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        cookies.push({ name, options });
      },
      cookie: (name: string, value: string, options: Record<string, unknown>) => {
        cookies.push({ name, value, options });
      },
    } as unknown as TrpcContext["res"],
  };
}

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
      ip: "127.0.0.1",
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
      cookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

// ==========================================
// اختبارات نظام المصادقة المحلية
// ==========================================
describe("localAuth", () => {
  it("login rejects empty username", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.localAuth.login({ username: "", password: "test" })
    ).rejects.toThrow();
  });

  it("login rejects empty password", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.localAuth.login({ username: "admin", password: "" })
    ).rejects.toThrow();
  });

  it("login rejects invalid credentials", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.localAuth.login({ username: "nonexistent_user_xyz", password: "wrong" })
    ).rejects.toThrow();
  });

  it("listUsers returns array", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const users = await caller.localAuth.listUsers();
    expect(Array.isArray(users)).toBe(true);
  });

  it("createUser rejects duplicate username", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    // First create a unique user
    const uniqueName = `test_${Date.now()}`;
    await caller.localAuth.createUser({
      username: uniqueName,
      password: "test1234",
      name: "مستخدم اختبار",
      role: "user",
    });

    // Try to create duplicate
    await expect(
      caller.localAuth.createUser({
        username: uniqueName,
        password: "test1234",
        name: "مستخدم اختبار 2",
        role: "user",
      })
    ).rejects.toThrow("اسم المستخدم موجود مسبقاً");
  });

  it("createUser requires admin role", async () => {
    const ctx = createMockContext({ role: "user" });
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.localAuth.createUser({
        username: "newuser",
        password: "test1234",
        name: "مستخدم جديد",
        role: "user",
      })
    ).rejects.toThrow();
  });
});

// ==========================================
// اختبارات Excel
// ==========================================
describe("excel", () => {
  it("exportAssets returns base64 and filename", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.excel.exportAssets();
    expect(result).toHaveProperty("base64");
    expect(result).toHaveProperty("filename");
    expect(result).toHaveProperty("count");
    expect(typeof result.base64).toBe("string");
    expect(result.base64.length).toBeGreaterThan(0);
    expect(result.filename).toContain("الأصول");
    expect(result.filename).toContain(".xlsx");
  });

  it("exportCustody returns base64 and filename", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.excel.exportCustody();
    expect(result).toHaveProperty("base64");
    expect(result).toHaveProperty("filename");
    expect(result.filename).toContain("العهد");
  });

  it("exportEmployees returns base64 and filename", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.excel.exportEmployees();
    expect(result).toHaveProperty("base64");
    expect(result).toHaveProperty("filename");
    expect(result.filename).toContain("الموظفين");
  });

  it("exportAuditLog returns base64 and filename", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.excel.exportAuditLog({});
    expect(result).toHaveProperty("base64");
    expect(result).toHaveProperty("filename");
    expect(result.filename).toContain("سجل_التدقيق");
  });

  it("exportReport returns base64 and filename", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.excel.exportReport({ reportType: "all" });
    expect(result).toHaveProperty("base64");
    expect(result).toHaveProperty("filename");
  });

  it("downloadTemplate returns template for assets", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.excel.downloadTemplate({ type: "assets" });
    expect(result).toHaveProperty("base64");
    expect(result).toHaveProperty("filename");
    expect(result.filename).toContain("قالب");
  });

  it("downloadTemplate returns template for custody", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.excel.downloadTemplate({ type: "custody" });
    expect(result).toHaveProperty("base64");
    expect(result.filename).toContain("قالب");
  });

  it("downloadTemplate returns template for employees", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.excel.downloadTemplate({ type: "employees" });
    expect(result).toHaveProperty("base64");
    expect(result.filename).toContain("قالب");
  });

  it("importAssets rejects invalid data", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    // Empty base64 should throw error
    await expect(
      caller.excel.importAssets({ base64Data: "" })
    ).rejects.toThrow();
  });
});

// ==========================================
// اختبارات النسخ الاحتياطي
// ==========================================
describe("backup", () => {
  it("create returns backup info", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.backup.create();
    expect(result).toHaveProperty("totalRecords");
    expect(result).toHaveProperty("url");
    expect(result).toHaveProperty("fileName");
    expect(typeof result.totalRecords).toBe("number");
    expect(result.totalRecords).toBeGreaterThanOrEqual(0);
  });

  it("list returns array of backups", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const backups = await caller.backup.list();
    expect(Array.isArray(backups)).toBe(true);
    // list should return an array (may be empty if no backups exist)
    expect(backups.length).toBeGreaterThanOrEqual(0);
  });

  it("restore rejects invalid data", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    // Invalid base64 should fail
    await expect(
      caller.backup.restore({ base64Data: "invalid_not_json" })
    ).rejects.toThrow();
  });
});
