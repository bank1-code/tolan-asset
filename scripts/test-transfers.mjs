import { startVitest } from "vitest/node";
import path from "node:path";

const ctx = await startVitest("test", ["server/transfers.test.ts", "server/exclusions.test.ts"], {
  config: false, run: true, maxWorkers: 1, minWorkers: 1,
}, { resolve: { alias: { "@shared": path.resolve("shared") } } });
if (!ctx) process.exitCode = 1;
else {
  const files = ctx.state.getFiles();
  process.exitCode = files.length !== 2 || files.some(file => file.result?.state === "fail") ? 1 : 0;
  await ctx.close();
}
