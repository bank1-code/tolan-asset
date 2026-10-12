import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { eq } from "drizzle-orm";
import { users } from "../drizzle/schema";
import { COOKIE_NAME } from "../shared/const";
import { claimLoginSession } from "./loginSession";
const state = vi.hoisted(() => ({ db: null as any }));
vi.mock("./_core/env", () => ({ ENV: { cookieSecret: "field-help-fixture-key-at-least-32-characters", appId: "field-help-fixture", oAuthServerUrl: "" } }));
vi.mock("./db", () => ({
  getUserByOpenId: async (openId: string) => (await state.db.select().from(users).where(eq(users.openId, openId)))[0],
  initializeSessionVersion: (openId: string, options: any) => claimLoginSession(state.db, openId, options),
  upsertUser: async () => {},
}));
import { sdk } from "./_core/sdk";
const request = (token: string) => ({ headers: { cookie: `${COOKIE_NAME}=${token}` } } as any);
describe.skipIf(process.env.RUN_FIELD_HELP_DB_TESTS !== "1")("Field help across real database login sessions", () => {
  let pool: mysql.Pool;
  beforeAll(async () => {
    const target = process.env.TEST_DATABASE_URL;
    if (!target || new URL(target).pathname === new URL(process.env.DATABASE_URL!).pathname) throw Error("Isolated database required");
    pool = mysql.createPool({ uri: target, ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true }, connectionLimit: 4 });
    state.db = drizzle(pool);
    for (const openId of ["field-help-sequential", "field-help-boundary", "field-help-bad-credentials"])
      await state.db.insert(users).values({ openId, name: "Field help fixture", role: "accountant", passwordHash: "verified-fixture-hash" });
  });
  afterAll(async () => { await pool?.end(); state.db = null; });
  const login = (openId: string) => sdk.createSessionToken(openId, { credentialHash: "verified-fixture-hash" });
  it("keeps hints on every request for logins one through three and hides them from four", async () => {
    let firstToken = "";
    for (let ordinal = 1; ordinal <= 5; ordinal++) {
      const token = await login("field-help-sequential"); if (ordinal === 1) firstToken = token;
      for (let refresh = 0; refresh < 3; refresh++)
        expect((await sdk.authenticateRequest(request(token))).fieldHelpEnabled).toBe(ordinal <= 3);
      const [saved] = await state.db.select().from(users).where(eq(users.openId, "field-help-sequential"));
      expect(saved.fieldHelpLoginCount).toBe(Math.min(4, ordinal));
    }
    // A session's setting is stable even when another device logs in later.
    expect((await sdk.authenticateRequest(request(firstToken))).fieldHelpEnabled).toBe(true);
    const otherUser = await sdk.authenticateRequest(request(await login("field-help-bad-credentials")));
    expect(otherUser.fieldHelpEnabled).toBe(true);
  }, 30000);
  it("claims the third and fourth login atomically during competing logins", async () => {
    await state.db.update(users).set({ fieldHelpLoginCount: 2 }).where(eq(users.openId, "field-help-boundary"));
    const tokens = await Promise.all([login("field-help-boundary"), login("field-help-boundary")]);
    const sessions = await Promise.all(tokens.map(token => sdk.authenticateRequest(request(token))));
    expect(sessions.filter(user => user.fieldHelpEnabled)).toHaveLength(1);
    const [saved] = await state.db.select().from(users).where(eq(users.openId, "field-help-boundary"));
    expect(saved.fieldHelpLoginCount).toBe(4);
  });
  it("rejects stale credentials without consuming a login or resetting the session epoch", async () => {
    const [before] = await state.db.select().from(users).where(eq(users.openId, "field-help-bad-credentials"));
    await expect(sdk.createSessionToken(before.openId, { credentialHash: "stale-hash" })).rejects.toThrow("Credentials changed");
    const [after] = await state.db.select().from(users).where(eq(users.id, before.id));
    expect(after.fieldHelpLoginCount).toBe(before.fieldHelpLoginCount);
    expect(after.sessionVersion).toBe(before.sessionVersion);
  });
});
