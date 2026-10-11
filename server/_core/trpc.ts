import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import type { TrpcContext } from "./context";
import { APPROVER_ROLES, OPERATOR_ROLES, type Role } from "../../shared/roles";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    if (!(error.cause instanceof ZodError)) return shape;
    const messages = [...new Set(error.cause.issues
      .map(issue => issue.message)
      .filter(message => /[\u0600-\u06ff]/.test(message)))];
    return { ...shape, message: messages.length
      ? messages.slice(0, 3).join("؛ ")
      : "بيانات الإدخال غير صالحة. راجع الحقول المطلوبة والقيم ثم حاول مجددًا." };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  return next({ ctx: { ...ctx, user: ctx.user } });
});

const requireRoles = (...roles: Role[]) =>
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    if (!roles.includes(ctx.user.role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG || "ليس لديك صلاحية لتنفيذ هذه العملية" });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  });

export const protectedProcedure = t.procedure.use(requireUser);
export const ownerProcedure = t.procedure.use(requireRoles("owner"));
export const adminProcedure = t.procedure.use(requireRoles("owner", "admin"));
export const approvalProcedure = t.procedure.use(requireRoles(...APPROVER_ROLES));
export const operatorProcedure = t.procedure.use(requireRoles(...OPERATOR_ROLES));
export const deleteProcedure = t.procedure.use(requireRoles("owner", "admin"));
