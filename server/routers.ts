import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { settingsRouter } from "./routers/settings";
import { inventoryRouter } from "./routers/inventory";
import { operationsRouter } from "./routers/operations";
import { recordsRouter } from "./routers/records";
import { excelRouter } from "./routers/excel";
import { backupRouter } from "./routers/backup";
import { localAuthRouter } from "./routers/localAuth";
import { uploadRouter } from "./routers/upload";
import { inventoryCountRouter } from "./routers/inventoryCount";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(({ ctx }) => ctx.user ? ({
      id: ctx.user.id,
      username: ctx.user.username,
      name: ctx.user.name,
      email: ctx.user.email,
      role: ctx.user.role,
      employeeId: ctx.user.employeeId,
      loginMethod: ctx.user.loginMethod,
      lastSignedIn: ctx.user.lastSignedIn,
    }) : null),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // Feature routers
  settings: settingsRouter,
  inventory: inventoryRouter,
  operations: operationsRouter,
  records: recordsRouter,
  excel: excelRouter,
  backup: backupRouter,
  localAuth: localAuthRouter,
  upload: uploadRouter,
  inventoryCount: inventoryCountRouter,
});

export type AppRouter = typeof appRouter;
