import "dotenv/config";
import mysql from "mysql2/promise";
import { readFileSync } from "node:fs";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
const db = await mysql.createConnection({
  uri: process.env.DATABASE_URL,
  ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
});
const validRoles = [
  "owner",
  "admin",
  "accounting_manager",
  "accountant",
  "employee",
];
try {
  const [before] = await db.query("SELECT id, role FROM users ORDER BY id");
  if (before.some(user => !validRoles.includes(user.role)))
    throw new Error(
      "Unexpected existing role; migration stopped before any schema changes."
    );
  const sql = readFileSync(
    new URL("../drizzle/0015_accounting_manager_role.sql", import.meta.url),
    "utf8"
  ).trim();
  if (
    !/^ALTER TABLE `users` MODIFY COLUMN `role` enum\('owner','admin','accounting_manager','accountant','employee'\) NOT NULL DEFAULT 'employee';$/.test(
      sql
    )
  )
    throw new Error("Unexpected role migration statement.");
  const [columns] = await db.query(
    "SELECT COLUMN_TYPE AS type FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='users' AND column_name='role'"
  );
  if (columns.length !== 1) throw new Error("User role column unavailable.");
  if (!columns[0].type.includes("'accounting_manager'")) await db.query(sql);
  const [verified] = await db.query(
    "SELECT COLUMN_TYPE AS type FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='users' AND column_name='role'"
  );
  if (!verified[0]?.type.includes("'accounting_manager'"))
    throw new Error("Accounting manager role was not added.");
  const [after] = await db.query("SELECT id, role FROM users ORDER BY id");
  if (JSON.stringify(before) !== JSON.stringify(after))
    throw new Error(
      "User roles changed during migration; inspect concurrent activity."
    );
  console.log(
    `Accounting manager role schema verified. All ${before.length} existing users and their assigned roles preserved; no account promoted automatically.`
  );
} finally {
  await db.end();
}
