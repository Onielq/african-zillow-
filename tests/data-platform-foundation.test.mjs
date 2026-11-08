import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const read = (path) => fs.readFile(new URL(path, import.meta.url), "utf8");

test("REJA core and market migrations are carried forward without demo transactions", async () => {
  const core = await read("../database/migrations/001_reja_core.sql");
  const market = await read("../database/migrations/002_reja_market_intelligence.sql");
  assert.match(core, /CREATE TABLE IF NOT EXISTS reja\.assets/);
  assert.match(core, /CREATE TABLE IF NOT EXISTS reja\.asset_field_claims/);
  assert.match(market, /CREATE TABLE IF NOT EXISTS reja\.market_transactions/);
  assert.match(market, /CREATE TABLE IF NOT EXISTS reja\.market_transaction_evidence/);
  assert.match(market, /CREATE OR REPLACE VIEW reja\.market_verified_transactions/);
  assert.doesNotMatch(market, /INSERT INTO reja\.market_transactions/i);
});

test("administrative geography and cadastral parcels are separate PostGIS records", async () => {
  const sql = await read("../database/migrations/003_unified_platform.sql");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS reja\.geographic_areas/);
  assert.match(sql, /area_level text NOT NULL CHECK \(area_level IN \('district','sector','cell','village'\)\)/);
  assert.match(sql, /CREATE OR REPLACE VIEW reja\.geo_areas/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS reja\.parcels/);
  assert.match(sql, /parcel_geometry geometry\(MultiPolygon, 4326\)/);
  assert.match(sql, /area_basis text NOT NULL DEFAULT 'unknown'/);
  assert.match(sql, /legal_status text NOT NULL DEFAULT 'unverified'/);
});

test("development model links developers, organizations, projects, parcels, buildings and units", async () => {
  const sql = await read("../database/migrations/003_unified_platform.sql");
  for (const name of [
    "organizations", "organization_memberships", "development_projects",
    "development_project_parcels", "development_buildings", "development_units"
  ]) assert.match(sql, new RegExp("CREATE TABLE IF NOT EXISTS reja\\." + name));
  assert.match(sql, /legacy_developer_external_id text REFERENCES reja\.developers/);
  assert.match(sql, /site_boundary geometry\(MultiPolygon, 4326\)/);
  assert.match(sql, /development_unit_id uuid REFERENCES reja\.development_units/);
});

test("exchange listing exposure requires verified organizations and current authority", async () => {
  const sql = await read("../database/migrations/003_unified_platform.sql");
  assert.match(sql, /publication_state text NOT NULL DEFAULT 'research_only'/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS reja\.market_listing_authorizations/);
  assert.match(sql, /A listing cannot be published without verified, current authority/);
  assert.match(sql, /CREATE OR REPLACE VIEW reja\.exchange_listings/);
  assert.match(sql, /CREATE OR REPLACE VIEW reja\.public_market_listings/);
  assert.match(sql, /o\.verification_state = 'verified'/);
  assert.match(sql, /a\.authorization_state = 'verified'/);
  assert.match(sql, /l\.expires_at > now\(\)/);
  assert.doesNotMatch(sql, /INSERT INTO reja\.(organizations|development_projects|development_units|market_listings)/i);
});

test("the unified schema satisfies the existing application readiness contract", async () => {
  const lib = await read("../src/lib/reja-database.ts");
  const sql = await read("../database/migrations/003_unified_platform.sql");
  for (const objectName of ["schema_migrations", "assets", "market_properties",
    "market_verified_transactions", "geo_areas", "parcels", "development_units", "exchange_listings"]) {
    assert.match(lib, new RegExp("reja\\." + objectName));
    if (!["schema_migrations", "assets", "market_properties", "market_verified_transactions"].includes(objectName)) {
      assert.match(sql, new RegExp("reja\\." + objectName));
    }
  }
});

test("migration runner uses direct connections, checksums and serialized migrations", async () => {
  const runner = await read("../scripts/db-migrate.mjs");
  assert.match(runner, /DATABASE_URL_UNPOOLED/);
  assert.match(runner, /-pooler/);
  assert.match(runner, /createHash\("sha256"\)/);
  assert.match(runner, /pg_advisory_lock/);
  assert.match(runner, /has changed\. Add a new migration instead/);
});
