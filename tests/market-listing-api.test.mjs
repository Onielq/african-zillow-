import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";

const read = (file) => fs.readFile(new URL(file, import.meta.url), "utf8");

test("public listing API requires the dedicated read-only database connection", async () => {
  const database = await read("../src/lib/reja-database.ts");
  const listingRoute = await read("../src/app/api/market/listings/route.ts");
  assert.match(database, /process\.env\.APP_DATABASE_URL\?\.trim\(\)/);
  assert.match(listingRoute, /createRejaReadOnlyDatabase/);
  assert.match(listingRoute, /LISTING_FEED_NOT_CONFIGURED/);
  assert.match(listingRoute, /verifyRejaReadOnlyRole/);
  assert.match(database, /rolbypassrls/);
  assert.match(database, /has_table_privilege/);
  assert.match(database, /can_write/);
  assert.doesNotMatch(listingRoute, /process\.env\.DATABASE_URL/);
  for (const endpoint of [
    "../src/app/api/market/listings/route.ts",
    "../src/app/api/market/listings/[id]/history/route.ts",
    "../src/app/api/market/exchange/listings/route.ts",
    "../src/app/api/market/exchange/listings/[id]/history/route.ts"
  ]) {
    assert.match(await read(endpoint), /verifyRejaReadOnlyRole/);
  }
  for (const schemaObject of [
    /market_listing_observations/,
    /source_reuse_permissions/,
    /listing_authorizations/,
    /exchange_listing_observations/,
    /exchange_listing_events/,
    /has_verified_listing_authorization/
  ]) {
    assert.match(database, schemaObject);
  }
});

test("external listings are gated by explicit source reuse permissions", async () => {
  const route = await read("../src/app/api/market/listings/route.ts");
  for (const rule of [
    /l\.is_current = true/,
    /l\.listing_status = 'active'/,
    /s\.is_current = true/,
    /s\.license_status = 'permitted'/,
    /s\.commercial_use_allowed IS TRUE/,
    /s\.redistribution_allowed IS TRUE/,
    /s\.caching_allowed IS TRUE/
  ]) {
    assert.match(route, rule);
  }
  assert.match(route, /No source-authorized current listings were found/);
  assert.match(route, /This does not mean no properties are available/);
});

test("external feed endpoints remain read-only and separate from first-party exchange inventory", async () => {
  const listingRoute = await read("../src/app/api/market/listings/route.ts");
  const historyRoute = await read("../src/app/api/market/listings/[id]/history/route.ts");
  assert.match(listingRoute, /export async function GET/);
  assert.match(historyRoute, /export async function GET/);
  assert.doesNotMatch(listingRoute + historyRoute, /\b(?:INSERT INTO|UPDATE reja\.|DELETE FROM)\b/i);
  assert.doesNotMatch(listingRoute + historyRoute, /reja\.exchange_listings/);
  assert.match(historyRoute, /reja\.market_listing_observations/);
  assert.match(historyRoute, /buildMarketListingHistory/);
});

test("history lookup repeats the same source-permission gates as the public feed", async () => {
  const route = await read("../src/app/api/market/listings/[id]/history/route.ts");
  for (const rule of [
    /s\.license_status = 'permitted'/,
    /s\.commercial_use_allowed IS TRUE/,
    /s\.redistribution_allowed IS TRUE/,
    /s\.caching_allowed IS TRUE/
  ]) {
    assert.match(route, rule);
  }
  assert.match(route, /statusBasis: "source_reported"/);
  assert.match(route, /not proof of a registered sale/);
});


test("first-party exchange endpoints expose only published, unexpired listings", async () => {
  const route = await read("../src/app/api/market/exchange/listings/route.ts");
  const history = await read("../src/app/api/market/exchange/listings/[id]/history/route.ts");
  assert.match(route, /l\.publication_status = 'published'/);
  assert.match(route, /l\.expires_at IS NULL OR l\.expires_at > now\(\)/);
  assert.match(route, /inventoryKind: "first_party_taiseel"/);
  assert.match(history, /l\.publication_status = 'published'/);
  assert.match(history, /reja\.exchange_listing_events/);
  assert.match(history, /reja\.exchange_listing_observations/);
  const executableSources = (route + history).replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(executableSources, /moderation_notes|event_data|actor_user_id/);
  assert.doesNotMatch(route + history, /AS ["']?sellerUserId/i);
  assert.doesNotMatch(route + history, /\b(?:INSERT INTO|UPDATE reja\.|DELETE FROM)\b/i);
});


test("public exchange reads recheck the verified seller authorization and its validity", async () => {
  const route = await read("../src/app/api/market/exchange/listings/route.ts");
  const history = await read("../src/app/api/market/exchange/listings/[id]/history/route.ts");
  for (const source of [route, history]) {
    assert.match(source, /reja\.has_verified_listing_authorization\(/);
    assert.match(source, /l\.listing_authorization_id/);
    assert.match(source, /l\.market_property_id/);
    assert.match(source, /l\.seller_user_id/);
    assert.match(source, /l\.seller_organization_id/);
  }
});


test("exchange listing totals use the same current-property join as visible rows", async () => {
  const route = await read("../src/app/api/market/exchange/listings/route.ts");
  assert.match(
    route,
    /SELECT count\(\*\)::integer AS total\s+FROM reja\.exchange_listings l\s+JOIN reja\.market_properties p\s+ON p\.id = l\.market_property_id AND p\.is_current = true/
  );
});

test("listing history does not invent an original price when no snapshots exist", async () => {
  const route = await read("../src/app/api/market/listings/[id]/history/route.ts");
  assert.match(route, /const historyInput = observations\.map/);
  assert.doesNotMatch(route, /listing\.firstSeenAt[\s\S]{0,180}listing\.askingAmount/);
  assert.match(route, /historyBasis: observations\.length > 0 \? "source_observations" : "no_observations"/);
  assert.match(route, /A current asking price cannot establish the original price/);
});
