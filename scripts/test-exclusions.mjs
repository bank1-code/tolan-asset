import { startVitest } from "vitest/node";
import path from "node:path";

// Avoid configuration bundling, which needs ancestor-directory access in the
// desktop Windows sandbox. Test execution remains inside the sandbox.
const ctx = await startVitest("test", ["server/exclusions.test.ts"], {
  config: false, run: true, maxWorkers: 1, minWorkers: 1,
}, { resolve: { alias: { "@shared": path.resolve("shared") } } });
if (!ctx) process.exitCode = 1;
else {
  process.exitCode = ctx.state.getFiles().some(file => file.result?.state === "fail") ? 1 : 0;
  await ctx.close();
}
