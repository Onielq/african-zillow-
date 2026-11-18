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
  assert.doesNotMatch(listingRoute, /process\.env\.DATABASE_URL/);
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
