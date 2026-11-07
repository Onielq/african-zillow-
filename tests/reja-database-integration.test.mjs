import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFile(path.join(root, relativePath), "utf8");

test("server runtime includes the Neon driver and keeps it server-side", async () => {
  const pkg = JSON.parse(await read("package.json"));
  assert.equal(pkg.dependencies["@neondatabase/serverless"], "^1.2.0");
  const db = await read("src/lib/reja-database.ts");
  assert.match(db, /import \{ neon \} from "@neondatabase\/serverless"/);
  assert.match(db, /process\.env\.DATABASE_URL/);
  assert.match(db, /AbortSignal\.timeout\(5_000\)/);
  assert.doesNotMatch(db, /NEXT_PUBLIC_DATABASE_URL/);
});

test("database health check detects the four-pillar schema without exposing credentials", async () => {
  const db = await read("src/lib/reja-database.ts");
  for (const objectName of [
    "reja.schema_migrations",
    "reja.geo_areas",
    "reja.parcels",
    "reja.development_units",
    "reja.exchange_listings",
    "reja.market_verified_transactions"
  ]) {
    assert.ok(db.includes(objectName), "missing readiness probe for " + objectName);
  }
  assert.match(db, /Connection details and provider error text are intentionally withheld/);
  assert.match(db, /schema is incomplete/);
  assert.match(db, /The configured PostgreSQL database responded/);
});

test("public source health delegates database checks to the Neon integration", async () => {
  const route = await read("src/app/api/data-sources/health/route.ts");
  assert.match(route, /checkRejaDatabaseIntegration/);
  assert.match(route, /const \[resend, database\] = await Promise\.all/);
  assert.match(route, /database,/);
  assert.doesNotMatch(route, /URL present · driver\/schema not integrated/);
});
