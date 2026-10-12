import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { users } from "../drizzle/schema";
import type { getDb } from "./db";

export async function claimLoginSession(database: NonNullable<Awaited<ReturnType<typeof getDb>>>, openId: string, options: { countFieldHelpLogin?: boolean; credentialHash?: string } = {}) {
  return database.transaction(async tx => {
    const [user] = await tx.select().from(users).where(eq(users.openId, openId)).limit(1).for("update");
    if (!user) throw new Error("Account unavailable");
    if (options.credentialHash !== undefined && user.passwordHash !== options.credentialHash)
      throw new Error("Credentials changed; log in again");
    const sessionVersion = user.sessionVersion || randomUUID();
    const fieldHelpLoginCount = options.countFieldHelpLogin ? Math.min(4, user.fieldHelpLoginCount + 1) : user.fieldHelpLoginCount;
    if (!user.sessionVersion || options.countFieldHelpLogin)
      await tx.update(users).set({ sessionVersion, fieldHelpLoginCount }).where(eq(users.id, user.id));
    return { ...user, sessionVersion, fieldHelpLoginCount };
  });
}
