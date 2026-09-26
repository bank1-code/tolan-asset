import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({ transformer: superjson });

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  return next({ ctx: { ...ctx, user: ctx.user } });
});

const requireRoles = (...roles: Array<"owner" | "admin" | "accountant" | "employee">) =>
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
export const operatorProcedure = t.procedure.use(requireRoles("owner", "admin", "accountant"));
export const deleteProcedure = t.procedure.use(requireRoles("owner", "admin"));
