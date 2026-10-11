import "dotenv/config";
import mysql from "mysql2/promise";
import { readFileSync } from "node:fs";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const db = await mysql.createConnection({
  uri: process.env.DATABASE_URL,
  ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
});
try {
  const tables = [
    "assets",
    "custody_items",
    "inventory_sessions",
    "asset_transfers",
    "asset_exclusions",
    "archive_documents",
    "audit_log",
  ];
  const counts = async () =>
    Object.fromEntries(
      await Promise.all(
        tables.map(async table => {
          const [rows] = await db.query(
            `SELECT COUNT(*) AS count FROM \`${table}\``
          );
          return [table, Number(rows[0].count)];
        })
      )
    );
  const before = await counts();
  const statements = [
    "0016_inventory_count_approval.sql",
    "0017_inventory_difference_followup.sql",
    "0018_inventory_count_usability.sql",
  ]
    .map(file =>
      readFileSync(new URL(`../drizzle/${file}`, import.meta.url), "utf8")
    )
    .join("--> statement-breakpoint")
    .split("--> statement-breakpoint")
    .map(sql => sql.trim())
    .filter(Boolean);
  if (!process.argv.includes("--check"))
    for (const statement of statements) {
      const column = statement.match(/ALTER TABLE `([^`]+)` ADD `([^`]+)`/);
      const constraint = statement.match(
        /ALTER TABLE `([^`]+)` ADD CONSTRAINT `([^`]+)`/
      );
      if (column) {
        const [found] = await db.query(
          "SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=?",
          column.slice(1)
        );
        if (found.length) continue;
      }
      if (constraint) {
        const [found] = await db.query(
          "SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema=DATABASE() AND table_name=? AND constraint_name=?",
          constraint.slice(1)
        );
        if (found.length) continue;
      }
      await db.query(
        statement.replace(
          /CREATE TABLE `([^`]+)`/,
          "CREATE TABLE IF NOT EXISTS `$1`"
        )
      );
    }
  const [columns] = await db.query(
    "SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='inventory_sessions' AND column_name IN ('status','version','approvedBy','approvedByName','approvedAt','scope','reviewNote','overlapReason','submittedAt','lastSaveKey')"
  );
  const [constraints] = await db.query(
    "SELECT CONSTRAINT_NAME FROM information_schema.table_constraints WHERE constraint_schema=DATABASE() AND constraint_name IN ('inventory_differences_session_entity_unique','inventory_differences_sessionId_inventory_sessions_id_fk','inventory_sessions_approvedBy_users_id_fk','inventory_difference_actions_operationKey_unique','inventory_diff_action_difference_fk','inventory_difference_actions_performedBy_users_id_fk')"
  );
  if (columns.length !== 10 || constraints.length !== 6)
    throw new Error(
      "Inventory-count schema verification incomplete; rerun the idempotent migration."
    );
  const [differenceColumns] = await db.query(
    "SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='inventory_differences' AND column_name IN ('itemSnapshot','workQuantity','identityMismatch')"
  );
  if (differenceColumns.length !== 3)
    throw new Error("Difference schema verification incomplete");
  const after = await counts();
  if (JSON.stringify(before) !== JSON.stringify(after))
    throw new Error("Record counts changed; inspect concurrent activity.");
  console.log(
    "Inventory count schema verified. Existing records preserved:",
    JSON.stringify(after)
  );
} finally {
  await db.end();
}
