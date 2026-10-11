import { COOKIE_NAME, SESSION_TTL_MS } from "@shared/const";
import { randomBytes } from "node:crypto";
import { parse as parseCookie } from "cookie";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

export function registerOAuthRoutes(app: Express) {
  // Local-password deployments expose no unused federated login surface.
  if (process.env.OAUTH_ENABLED !== "true") return;
  const portal = new URL(process.env.OAUTH_PORTAL_URL || "");
  const redirect = new URL(process.env.OAUTH_REDIRECT_URI || "");
  if (portal.protocol !== "https:" || redirect.protocol !== "https:" || redirect.pathname !== "/api/oauth/callback")
    throw new Error("Configure HTTPS OAUTH_PORTAL_URL and OAUTH_REDIRECT_URI");
  if (!process.env.OAUTH_SERVER_URL || !process.env.VITE_APP_ID) throw new Error("OAuth configuration incomplete");
  const pending = new Map<string, {expiry:number;ip:string}>();
  const stateCookie = "tolan_oauth_state";
  app.get("/api/oauth/start", (req, res) => {
    for (const [nonce, transaction] of pending) if (transaction.expiry <= Date.now()) pending.delete(nonce);
    const previous = parseCookie(req.headers.cookie || "")[stateCookie];
    if (previous) pending.delete(previous);
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    // One source cannot occupy the global pool; restarting a browser transaction
    // replaces its previous slot, preserving retries and normal shared networks.
    if ([...pending.values()].filter(transaction=>transaction.ip===ip).length >= 50 || pending.size >= 10_000) { res.sendStatus(429); return; }
    const nonce = randomBytes(32).toString("hex");
    pending.set(nonce, {expiry:Date.now() + 10 * 60_000,ip});
    res.cookie(stateCookie, nonce, { ...getSessionCookieOptions(req), maxAge: 10 * 60_000 });
    const url = new URL("app-auth", portal.href.endsWith("/") ? portal.href : portal.href + "/");
    url.searchParams.set("appId", process.env.VITE_APP_ID!);
    url.searchParams.set("redirectUri", redirect.href);
    url.searchParams.set("state", nonce);
    url.searchParams.set("type", "signIn");
    res.redirect(302, url.href);
  });
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    const browserState = parseCookie(req.headers.cookie || "")[stateCookie];
    if (!code || !state || state !== browserState || (pending.get(state)?.expiry ?? 0) <= Date.now()) {
      res.status(400).json({ error: "Invalid or expired OAuth transaction" });
      return;
    }
    pending.delete(state);
    res.clearCookie(stateCookie, getSessionCookieOptions(req));

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, btoa(redirect.href));
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }

      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: SESSION_TTL_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: SESSION_TTL_MS });

      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}
