import { startVitest } from "vitest/node";
import path from "node:path";
const targets = ["server/history.test.ts", "server/inventoryLifecycle.test.ts", "server/transfers.test.ts", "server/exclusions.test.ts", "server/warranty.test.ts", "server/roles.test.ts", "server/hierarchyExcel.test.ts", "server/inventoryCountWorkflow.test.ts", "server/inventoryCountAdvanced.test.ts", "server/inventoryCountClient.test.ts"];
const ctx = await startVitest("test", targets, { config: false, run: true, maxWorkers: 1, minWorkers: 1 }, { resolve: { alias: { "@shared": path.resolve("shared"), "@": path.resolve("client/src") } } });
if (!ctx) process.exitCode = 1;
else { const files = ctx.state.getFiles(); process.exitCode = files.length !== targets.length || files.some(file => file.result?.state === "fail") ? 1 : 0; await ctx.close(); }
