import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(root, "database", "migrations");
const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

if (!connectionString) {
  console.error("DATABASE_URL_UNPOOLED or direct DATABASE_URL is required.");
  process.exit(1);
}
const parsedUrl = new URL(connectionString);
if (!["postgres:", "postgresql:"].includes(parsedUrl.protocol) || !parsedUrl.hostname) {
  console.error("A valid PostgreSQL connection string is required.");
  process.exit(1);
}
if (/-pooler\./i.test(parsedUrl.hostname)) {
  console.error("Migrations require a direct connection without a -pooler hostname.");
  process.exit(1);
}

const client = new Client({
  connectionString,
  application_name: "taiseel-schema-migrator",
  connectionTimeoutMillis: 10000,
  statement_timeout: 120000,
  query_timeout: 130000
});
let lockAcquired = false;

try {
  await client.connect();
  await client.query("SELECT pg_advisory_lock(hashtext('taiseel:schema-migrations'))");
  lockAcquired = true;
  await client.query("CREATE SCHEMA IF NOT EXISTS reja");
  await client.query(
    "CREATE TABLE IF NOT EXISTS reja.schema_migrations (" +
    "version text PRIMARY KEY, " +
    "checksum char(64) NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'), " +
    "applied_at timestamptz NOT NULL DEFAULT now())"
  );

  const names = (await fs.readdir(migrationsDir))
    .filter((name) => /^\d+_[a-z0-9_]+\.sql$/.test(name))
    .sort();
  if (!names.length) throw new Error("No SQL migrations found.");

  for (const name of names) {
    const sql = await fs.readFile(path.join(migrationsDir, name), "utf8");
    const checksum = crypto.createHash("sha256").update(sql).digest("hex");
    const existing = await client.query(
      "SELECT checksum FROM reja.schema_migrations WHERE version = $1",
      [name]
    );
    if (existing.rowCount) {
      if (existing.rows[0].checksum.trim() !== checksum) {
        throw new Error("Applied migration " + name + " has changed. Add a new migration instead.");
      }
      console.log("skip " + name + " (already applied)");
      continue;
    }

    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query(
        "INSERT INTO reja.schema_migrations (version, checksum) VALUES ($1, $2)",
        [name, checksum]
      );
      await client.query("COMMIT");
      console.log("applied " + name);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }

  const result = await client.query("SELECT version FROM reja.schema_migrations ORDER BY version");
  console.log("Verified " + result.rows.length + " immutable migrations.");
} catch (error) {
  console.error("Database migration failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  if (lockAcquired) {
    try {
      await client.query("SELECT pg_advisory_unlock(hashtext('taiseel:schema-migrations'))");
    } catch {
      // Closing the connection also releases the session lock.
    }
  }
  await client.end().catch(() => {});
}
