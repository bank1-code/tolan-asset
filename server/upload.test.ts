
import {legacyFixture} from './test-utils/legacyFixture';
const isolated=vi.hoisted(()=>({db:null}));
vi.mock('./db',()=>({getDb:async()=>isolated.db}));
vi.mock('./security',()=>({logAuditAction:vi.fn(),clearBruteForceBlock:vi.fn()}));
vi.mock('./storage',()=>({storagePut:vi.fn(async()=>({url:'/api/files/test/backup.tln'}))}));
beforeEach(()=>{isolated.db=legacyFixture();});
/**
 * اختبارات نظام رفع الصور (Upload Router)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
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
describe('inventory image paths',()=>{
 for(const kind of ['assets','custody']){
  const input=()=>({...kind==='assets'?{assetName:'أصل اختبار صور'}:{name:'عهدة اختبار صور'},quantity:1,assetValue:'100',assignedTo:1,departmentId:1,locationId:1,assetImagePath:'https://example.com/test.webp',invoiceImagePath:'https://example.com/invoice.webp'});
  const caller=()=>appRouter.createCaller(createMockContext()).inventory[kind];
  it(kind+' preserves images when saving and loading a draft',async()=>{const api=caller(),r=await api.create(input());expect(r.status).toBe('DRAFT');const saved=await api.getById({id:r.id});expect(saved.assetImagePath).toBe(input().assetImagePath);expect(saved.invoiceImagePath).toBe(input().invoiceImagePath);const list=await api.list({});expect(list.some(x=>x.id===r.id)).toBe(true);});
  it(kind+' edits draft images repeatedly with version checks',async()=>{const api=caller(),r=await api.create(input());await api.update({...input(),id:r.id,expectedVersion:0,assetImagePath:'https://example.com/new.webp',invoiceImagePath:null});const detail=await api.getById({id:r.id});expect(detail.assetImagePath).toBe('https://example.com/new.webp');expect(detail.invoiceImagePath).toBeNull();await expect(api.update({...input(),id:r.id,expectedVersion:0,assetImagePath:null})).rejects.toMatchObject({code:'CONFLICT'});});
  it(kind+' denies physical deletion and cancels its draft',async()=>{const api=caller(),r=await api.create(input());await expect(api.delete({id:r.id})).rejects.toMatchObject({code:'FORBIDDEN'});await api.cancelDraft({id:r.id,expectedVersion:0});expect((await api.getById({id:r.id})).status).toBe('CANCELLED');});
 }
});
