import "dotenv/config";
import mysql from "mysql2/promise";
import { readFileSync } from "node:fs";

// Apply only this feature's migration. Existing installations may have older
// migrations applied manually; this avoids replaying unrelated schema changes.
const db = await mysql.createConnection({
  uri: process.env.DATABASE_URL,
  ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
});
try {
  for (const [table, column] of [["asset_exclusions", "exclusionCode"], ["exclusion_sequence", "year"]]) {
    const [duplicates] = await db.query(`SELECT \`${column}\` FROM \`${table}\` GROUP BY \`${column}\` HAVING COUNT(*) > 1`);
    if (duplicates.length) throw new Error(`Duplicate ${table}.${column}; resolve before applying unique constraints.`);
  }
  const source = readFileSync(new URL("../drizzle/0010_melted_legion.sql", import.meta.url), "utf8");
  for (const statement of source.split("--> statement-breakpoint").map(s => s.trim()).filter(Boolean)) {
    const column = statement.match(/ALTER TABLE `([^`]+)` ADD `([^`]+)`/);
    const constraint = statement.match(/ALTER TABLE `([^`]+)` ADD CONSTRAINT `([^`]+)`/);
    if (column) {
      const [found] = await db.query("SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?", column.slice(1));
      if (found.length) continue;
    }
    if (constraint) {
      const [found] = await db.query("SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = ? AND constraint_name = ?", constraint.slice(1));
      if (found.length) continue;
    }
    await db.query(statement.replace("CREATE TABLE `exclusion_drafts`", "CREATE TABLE IF NOT EXISTS `exclusion_drafts`"));
  }
  // Preserve the existing counter and advance it if historical codes are ahead.
  const [codes] = await db.query("SELECT exclusionCode FROM asset_exclusions");
  const maxima = new Map();
  for (const row of codes) {
    const match = /^EXC-(\d{4})-(\d+)$/.exec(row.exclusionCode);
    if (match) maxima.set(Number(match[1]), Math.max(maxima.get(Number(match[1])) || 0, Number(match[2])));
  }
  for (const [year, seq] of maxima) {
    await db.query("INSERT INTO exclusion_sequence (year, seq) VALUES (?, ?) ON DUPLICATE KEY UPDATE seq = GREATEST(seq, VALUES(seq))", [year, seq]);
  }
  console.log("Exclusion schema migration applied; existing data preserved.");
} finally {
  await db.end();
}
