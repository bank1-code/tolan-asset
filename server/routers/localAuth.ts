import { z } from "zod";
import { publicProcedure, adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { employees, users } from "../../drizzle/schema";
import { and, eq, ne } from "drizzle-orm";
import { sdk } from "../_core/sdk";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "../_core/cookies";
import { logAuditAction, clearBruteForceBlock } from "../security";
import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";

const roleSchema = z.enum(["owner", "admin", "accountant", "employee"]);

async function validateEmployeeLink(db: Awaited<ReturnType<typeof getDb>>, role: string, employeeId?: number | null, excludeUserId?: number) {
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
  if (role !== "employee") return null;
  if (!employeeId) throw new TRPCError({ code: "BAD_REQUEST", message: "يجب ربط حساب الموظف بسجل موظف" });

  const [employee] = await db.select({ id: employees.id }).from(employees).where(eq(employees.id, employeeId)).limit(1);
  if (!employee) throw new TRPCError({ code: "BAD_REQUEST", message: "الموظف المحدد غير موجود" });

  const conditions = [eq(users.employeeId, employeeId)];
  if (excludeUserId) conditions.push(ne(users.id, excludeUserId));
  const [linked] = await db.select({ id: users.id }).from(users).where(and(...conditions)).limit(1);
  if (linked) throw new TRPCError({ code: "CONFLICT", message: "هذا الموظف مرتبط بحساب مستخدم آخر" });
  return employeeId;
}

export const localAuthRouter = router({
  login: publicProcedure
    .input(z.object({ username: z.string().min(1, "اسم المستخدم مطلوب"), password: z.string().min(1, "كلمة المرور مطلوبة") }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("قاعدة البيانات غير متوفرة");
      const [user] = await db.select().from(users).where(eq(users.username, input.username)).limit(1);
      if (!user || !user.passwordHash || !(await bcrypt.compare(input.password, user.passwordHash))) {
        throw new Error("اسم المستخدم أو كلمة المرور غير صحيحة");
      }
      await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, user.id));
      ctx.res.clearCookie(COOKIE_NAME, getSessionCookieOptions(ctx.req));
      const token = await sdk.createSessionToken(user.username || user.openId, { name: user.name || user.username || "مستخدم" });
      ctx.res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(ctx.req), maxAge: ONE_YEAR_MS });
      clearBruteForceBlock(ctx.req?.ip || "unknown");
      await logAuditAction({ tableName: "users", actionType: "LOGIN", actionDescription: `تسجيل دخول: ${user.username}`, performedBy: user.id, performedByName: user.name || user.username || "مستخدم", ipAddress: ctx.req?.ip || "unknown" });
      return { success: true, user: { id: user.id, name: user.name, username: user.username, role: user.role, employeeId: user.employeeId } };
    }),

  listUsers: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("قاعدة البيانات غير متوفرة");
    return db.select({
      id: users.id, username: users.username, name: users.name, role: users.role,
      employeeId: users.employeeId, employeeName: employees.fullName,
      lastSignedIn: users.lastSignedIn, createdAt: users.createdAt,
    }).from(users).leftJoin(employees, eq(users.employeeId, employees.id)).where(eq(users.loginMethod, "local"));
  }),

  createUser: adminProcedure
    .input(z.object({
      username: z.string().min(3, "اسم المستخدم يجب أن يكون 3 أحرف على الأقل"),
      password: z.string().min(4, "كلمة المرور يجب أن تكون 4 أحرف على الأقل"),
      name: z.string().min(1, "الاسم مطلوب"),
      role: roleSchema,
      employeeId: z.number().optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متوفرة");
      if (input.role === "owner" && ctx.user.role !== "owner") throw new TRPCError({ code: "FORBIDDEN", message: "مدير النظام لا يستطيع إنشاء حساب مالك" });
      const [existing] = await db.select().from(users).where(eq(users.username, input.username)).limit(1);
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "اسم المستخدم موجود مسبقاً" });
      const employeeId = await validateEmployeeLink(db, input.role, input.employeeId);
      await db.insert(users).values({
        openId: `local_${input.username}_${Date.now()}`, username: input.username,
        passwordHash: await bcrypt.hash(input.password, 10), name: input.name,
        role: input.role, employeeId, loginMethod: "local", lastSignedIn: new Date(),
      });
      await logAuditAction({ tableName: "users", actionType: "CREATE", actionDescription: `إنشاء مستخدم جديد: ${input.username} (${input.role})`, performedBy: ctx.user.id, performedByName: ctx.user.name || "مدير", ipAddress: ctx.req?.ip || "unknown" });
      return { success: true };
    }),

  updateUser: adminProcedure
    .input(z.object({ id: z.number(), name: z.string().optional(), role: roleSchema.optional(), employeeId: z.number().optional().nullable(), password: z.string().min(4).optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متوفرة");
      const [target] = await db.select().from(users).where(eq(users.id, input.id)).limit(1);
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "المستخدم غير موجود" });
      if (target.role === "owner" && ctx.user.role !== "owner") throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكن لمدير النظام تعديل حساب المالك" });
      if (input.role === "owner" && ctx.user.role !== "owner") throw new TRPCError({ code: "FORBIDDEN", message: "مدير النظام لا يستطيع منح صلاحية المالك" });
      const finalRole = input.role ?? target.role;
      const requestedEmployeeId = input.employeeId !== undefined ? input.employeeId : target.employeeId;
      const employeeId = await validateEmployeeLink(db, finalRole, requestedEmployeeId, input.id);
      const updateData: Record<string, unknown> = {};
      if (input.name !== undefined) updateData.name = input.name;
      if (input.role !== undefined) updateData.role = input.role;
      if (input.role !== undefined || input.employeeId !== undefined) updateData.employeeId = finalRole === "employee" ? employeeId : null;
      if (input.password) updateData.passwordHash = await bcrypt.hash(input.password, 10);
      if (!Object.keys(updateData).length) throw new TRPCError({ code: "BAD_REQUEST", message: "لا توجد بيانات للتحديث" });
      await db.update(users).set(updateData).where(eq(users.id, input.id));
      await logAuditAction({ tableName: "users", actionType: "UPDATE", actionDescription: `تعديل مستخدم #${input.id}`, performedBy: ctx.user.id, performedByName: ctx.user.name || "مدير", ipAddress: ctx.req?.ip || "unknown" });
      return { success: true };
    }),

  deleteUser: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متوفرة");
    if (ctx.user.id === input.id) throw new TRPCError({ code: "BAD_REQUEST", message: "لا يمكنك حذف حسابك الخاص" });
    const [target] = await db.select().from(users).where(eq(users.id, input.id)).limit(1);
    if (!target) throw new TRPCError({ code: "NOT_FOUND" });
    if (target.role === "owner") throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكن حذف حساب المالك" });
    await db.delete(users).where(eq(users.id, input.id));
    await logAuditAction({ tableName: "users", actionType: "DELETE", actionDescription: `حذف مستخدم #${input.id}`, performedBy: ctx.user.id, performedByName: ctx.user.name || "مدير", ipAddress: ctx.req?.ip || "unknown" });
    return { success: true };
  }),
});
