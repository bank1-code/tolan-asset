import { startVitest } from "vitest/node";
import path from "node:path";
process.env.RUN_INVENTORY_UI_FIXTURE = "1";
const ctx = await startVitest(
  "test",
  ["scripts/inventory-count-ui-fixture.test.ts"],
  { config: false, run: true, minWorkers: 1, maxWorkers: 1 },
  {
    resolve: {
      alias: {
        "@shared": path.resolve("shared"),
        "@": path.resolve("client/src"),
      },
    },
  }
);
if (ctx) await ctx.close();
else process.exitCode = 1;
