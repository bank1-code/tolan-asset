import { beforeAll, afterAll, beforeEach, expect, it, vi } from "vitest";
import express from "express";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const mocks = vi.hoisted(() => ({ authenticate: vi.fn() }));
vi.mock("./_core/sdk", () => ({ sdk: { authenticateRequest: mocks.authenticate } }));
import { operatingGuidesRouter } from "./operatingGuides";

let server: ReturnType<express.Express["listen"]>;
let base: string;
beforeAll(async () => {
  const app = express();
  app.use(operatingGuidesRouter);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
});
beforeEach(() => {
  mocks.authenticate.mockReset();
  mocks.authenticate.mockResolvedValue({ id: 1, role: "owner" });
});

const guides = [
  ["operating", "tolan-operating-guide.pdf"],
  ["quick", "tolan-quick-guide.pdf"],
] as const;
const digest = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");

it.each(["owner", "admin"])('allows %s to download both exact PDF files as private attachments', async role => {
  mocks.authenticate.mockResolvedValue({ id: 1, role });
  for (const [id, filename] of guides) {
    const response = await fetch(`${base}/api/operating-guides/${id}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/pdf");
    expect(response.headers.get("content-disposition")).toContain(`attachment; filename="${filename}"`);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toContain("Cookie");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    const body = new Uint8Array(await response.arrayBuffer());
    expect(digest(body)).toBe(digest(await readFile(`server/resources/guides/${filename}`)));
  }
});

it.each(["accounting_manager", "accountant", "employee"])('blocks %s even with a direct download URL', async role => {
  mocks.authenticate.mockResolvedValue({ id: 1, role });
  for (const [id] of guides) {
    const response = await fetch(`${base}/api/operating-guides/${id}`);
    expect(response.status).toBe(403);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.text()).not.toContain("%PDF-");
  }
});

it('rejects unauthenticated or expired sessions before returning either file', async () => {
  mocks.authenticate.mockRejectedValue(new Error("Invalid session cookie"));
  for (const [id] of guides) {
    const response = await fetch(`${base}/api/operating-guides/${id}`);
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain("%PDF-");
  }
});

it.each(["unknown", "__proto__", "constructor", "..%2F..%2F.env", "quick.pdf"])('rejects non-whitelisted file identifiers: %s', async id => {
  const response = await fetch(`${base}/api/operating-guides/${id}`);
  expect(response.status).toBe(404);
  expect(await response.text()).not.toContain("%PDF-");
});

it('checks the current role on every download and protects HEAD requests too', async () => {
  expect((await fetch(`${base}/api/operating-guides/quick`)).status).toBe(200);
  mocks.authenticate.mockResolvedValue({ id: 1, role: "accountant" });
  const head = await fetch(`${base}/api/operating-guides/quick`, { method: "HEAD" });
  expect(head.status).toBe(403);
  expect(head.headers.get("content-disposition")).toBeNull();
  expect(mocks.authenticate).toHaveBeenCalledTimes(2);
});
