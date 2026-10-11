import "dotenv/config";
import mysql from "mysql2/promise";
import { readFileSync } from "node:fs";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
const db = await mysql.createConnection({
  uri: process.env.DATABASE_URL,
  ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
});
try {
  const before = {};
  for (const table of [
    "assets",
    "custody_items",
    "asset_exclusions",
    "asset_transfers",
    "archive_documents",
    "audit_log",
  ]) {
    const [count] = await db.query(
      `SELECT COUNT(*) AS count FROM \`${table}\``
    );
    before[table] = Number(count[0].count);
  }
  console.log("Existing record counts:", JSON.stringify(before));
  if (!process.argv.includes("--check")) {
    const statements = readFileSync(
      new URL("../drizzle/0014_warranty_replacements.sql", import.meta.url),
      "utf8"
    )
      .split("--> statement-breakpoint")
      .map(s => s.trim())
      .filter(Boolean);
    for (const statement of statements) {
      if (
        !/^(CREATE TABLE `warranty_replacements`|ALTER TABLE `(assets|custody_items|warranty_replacements)` ADD )/.test(
          statement
        )
      )
        throw new Error("Unexpected warranty migration statement.");
      const column = statement.match(/ALTER TABLE `([^`]+)` ADD `([^`]+)`/),
        constraint = statement.match(
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
          "CREATE TABLE `warranty_replacements`",
          "CREATE TABLE IF NOT EXISTS `warranty_replacements`"
        )
      );
    }
    const [columns] = await db.query(
      "SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND ((table_name IN ('assets','custody_items') AND column_name IN ('warrantyReplacedQuantity','serialNumbers','warrantyStartDate','warrantyEndDate')) OR table_name='warranty_replacements')"
    );
    const [constraints] = await db.query(
      "SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema=DATABASE() AND table_name='warranty_replacements' AND constraint_name IN ('warranty_replacements_operationCode_unique','warranty_replacement_entity_unique','warranty_replacements_createdBy_users_id_fk','warranty_replacements_executedBy_users_id_fk')"
    );
    if (columns.length !== 24 || constraints.length !== 4)
      throw new Error("Warranty schema verification incomplete.");
    for (const [table, count] of Object.entries(before)) {
      const [after] = await db.query(
        `SELECT COUNT(*) AS count FROM \`${table}\``
      );
      if (Number(after[0].count) !== count)
        throw new Error(
          `Record count changed in ${table}; inspect concurrent activity.`
        );
    }
    console.log(
      "Warranty schema verified; all existing record counts preserved. No replacement operations were executed."
    );
  } else console.log("Read-only preflight completed; schema unchanged.");
} finally {
  await db.end();
}
