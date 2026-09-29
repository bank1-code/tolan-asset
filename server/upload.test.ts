/**
 * اختبارات نظام رفع الصور (Upload Router)
 */
import { describe, it, expect, vi } from "vitest";
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
// اختبارات رفع الصور
// ==========================================
describe("upload", () => {
  it("image upload rejects unauthenticated users", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.upload.image({
        base64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
        category: "asset",
      })
    ).rejects.toThrow();
  });

  it("image upload rejects empty base64", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.upload.image({
        base64: "",
        category: "asset",
      })
    ).rejects.toThrow();
  });

  it("image upload validates category enum", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    // Invalid category should fail zod validation
    await expect(
      caller.upload.image({
        base64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
        category: "invalid_category" as any,
      })
    ).rejects.toThrow();
  });

  it("multipleImages upload rejects unauthenticated users", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.upload.multipleImages({
        images: [
          { base64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==", category: "asset" },
        ],
      })
    ).rejects.toThrow();
  });

  it("multipleImages upload rejects empty array", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.upload.multipleImages({
        images: [],
      })
    ).rejects.toThrow();
  });

  it("image upload accepts valid categories", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    // These should pass zod validation (may fail at S3 upload stage)
    const validCategories = ["asset", "custody", "invoice", "exclusion", "document"] as const;
    for (const category of validCategories) {
      try {
        await caller.upload.image({
          base64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
          category,
        });
      } catch (error: any) {
        // Should fail at image processing/S3 level, not at validation level
        expect(error.message).not.toContain("Expected");
      }
    }
  });
});

// ==========================================
// اختبارات حفظ روابط الصور في الأصول والعهد
// ==========================================
describe("inventory image paths", () => {
  it("assets.create accepts assetImagePath and invoiceImagePath", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.inventory.assets.create({
      assetName: "أصل اختبار صور",
      assetCode: `AST-IMG-${Date.now()}`,
      quantity: 1,
      assetValue: "100",
      condition: "جيد جدًا",
      assignedTo: null,
      departmentId: null,
      locationId: null,
      notes: null,
      assetImagePath: "https://example.com/test-asset.webp",
      invoiceImagePath: "https://example.com/test-invoice.webp",
    });

    expect(result).toBeDefined();
    expect(result.id).toBeGreaterThan(0);
  });

  it("assets.list returns image paths", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const list = await caller.inventory.assets.list({});
    expect(Array.isArray(list)).toBe(true);

    // Find the asset we just created
    const testAsset = list.find((a: any) => a.assetName === "أصل اختبار صور");
    if (testAsset) {
      expect(testAsset.assetImagePath).toBe("https://example.com/test-asset.webp");
      expect(testAsset.invoiceImagePath).toBe("https://example.com/test-invoice.webp");
    }
  });

  it("assets.getById returns image paths", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const list = await caller.inventory.assets.list({});
    const testAsset = list.find((a: any) => a.assetName === "أصل اختبار صور");
    if (testAsset) {
      const detail = await caller.inventory.assets.getById({ id: testAsset.id });
      expect(detail).toBeDefined();
      expect(detail!.assetImagePath).toBe("https://example.com/test-asset.webp");
      expect(detail!.invoiceImagePath).toBe("https://example.com/test-invoice.webp");
    }
  });

  it("assets.update can update image paths", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const list = await caller.inventory.assets.list({});
    const testAsset = list.find((a: any) => a.assetName === "أصل اختبار صور");
    if (testAsset) {
      await caller.inventory.assets.update({
        id: testAsset.id,
        assetName: "أصل اختبار صور محدث",
        assetImagePath: "https://example.com/updated-asset.webp",
        invoiceImagePath: null,
      });

      const updated = await caller.inventory.assets.getById({ id: testAsset.id });
      expect(updated!.assetImagePath).toBe("https://example.com/updated-asset.webp");
    }
  });

  it("custody.create accepts assetImagePath and invoiceImagePath", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.inventory.custody.create({
      name: "عهدة اختبار صور",
      code: `CUS-IMG-${Date.now()}`,
      quantity: 1,
      assetValue: "200",
      condition: "جيد",
      assignedTo: null,
      departmentId: null,
      locationId: null,
      notes: null,
      assetImagePath: "https://example.com/test-custody.webp",
      invoiceImagePath: "https://example.com/test-custody-invoice.webp",
    });

    expect(result).toBeDefined();
    expect(result.id).toBeGreaterThan(0);
  });

  it("custody.list returns image paths", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const list = await caller.inventory.custody.list({});
    expect(Array.isArray(list)).toBe(true);

    const testCustody = list.find((c: any) => c.name === "عهدة اختبار صور");
    if (testCustody) {
      expect(testCustody.assetImagePath).toBe("https://example.com/test-custody.webp");
      expect(testCustody.invoiceImagePath).toBe("https://example.com/test-custody-invoice.webp");
    }
  });

  // Clean up test data
  it("cleanup: delete test assets and custody items", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const assetsList = await caller.inventory.assets.list({});
    for (const a of assetsList) {
      if ((a as any).assetName?.includes("اختبار صور")) {
        await caller.inventory.assets.delete({ id: a.id });
      }
    }

    const custodyList = await caller.inventory.custody.list({});
    for (const c of custodyList) {
      if ((c as any).name?.includes("اختبار صور")) {
        await caller.inventory.custody.delete({ id: c.id });
      }
    }
  });
});
