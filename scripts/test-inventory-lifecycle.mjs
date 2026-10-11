import { startVitest } from "vitest/node";
import path from "node:path";
const targets = ["server/inventoryLifecycle.test.ts", "server/transfers.test.ts", "server/exclusions.test.ts"];
const ctx = await startVitest("test", targets, { config: false, run: true, maxWorkers: 1, minWorkers: 1 }, { resolve: { alias: { "@shared": path.resolve("shared") } } });
if (!ctx) process.exitCode = 1;
else { const files = ctx.state.getFiles(); process.exitCode = files.length !== targets.length || files.some(file => file.result?.state === "fail") ? 1 : 0; await ctx.close(); }
