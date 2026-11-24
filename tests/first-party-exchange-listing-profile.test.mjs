import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("first-party listing profile resolves only a Taiseel-owned listing reference", async () => {
  const route = await read("../src/app/api/market/exchange/listing-profile/route.ts");
  assert.match(route, /params\.get\("listingReference"\)/);
  assert.match(route, /l\.listing_reference = \$\{listingReference\}/);
  assert.match(route, /FROM reja\.exchange_listings l/);
  assert.doesNotMatch(route, /FROM reja\.market_listings/);
});

test("first-party listing lookup repeats publication and seller authorization checks", async () => {
  const route = await read("../src/app/api/market/exchange/listing-profile/route.ts");
  assert.match(route, /l\.publication_status = 'published'/);
  assert.match(route, /l\.expires_at IS NULL OR l\.expires_at > now\(\)/);
  assert.match(route, /reja\.has_verified_listing_authorization\(/);
  assert.match(route, /verifyRejaReadOnlyRole/);
  assert.match(route, /createRejaReadOnlyDatabase/);
});

test("first-party parcel joins require a separate reviewer and a verified primary-site claim", async () => {
  const route = await read("../src/app/api/market/exchange/listing-profile/route.ts");
  assert.match(route, /FROM reja\.exchange_listing_parcel_links link/);
  assert.match(route, /link\.claim_status = 'verified'/);
  assert.match(route, /link\.relationship_role = 'primary_site'/);
  assert.match(route, /link\.is_current = true/);
  assert.match(route, /link\.reviewed_by_user_id <> link\.submitted_by_user_id/);
  assert.match(route, /link\.reviewed_at IS NOT NULL/);
  assert.match(route, /p\.upi IS NOT NULL/);
  assert.doesNotMatch(route, /ST_DWithin|ST_Distance|ST_Intersects|nearest coordinates/i);
});

test("public response hides internal listing IDs and private evidence references", async () => {
  const route = await read("../src/app/api/market/exchange/listing-profile/route.ts");
  assert.match(route, /Object\.entries\(listing\)\.filter\(\(\[key\]\) => key !== "recordId"\)/);
  assert.doesNotMatch(route, /evidence_reference|evidenceReference/);
  assert.doesNotMatch(route, /AS ["']?(?:sellerUserId|seller_user_id|createdByUserId)/i);
  assert.match(route, /listing: publicListing/);
});

test("buyer panel offers separate external-source and Taiseel inventory lookup modes", async () => {
  const lookup = await read("../src/components/map/BuyerListingLookup.tsx");
  assert.match(lookup, /External source/);
  assert.match(lookup, /Taiseel Exchange/);
  assert.match(lookup, /listingReference: id/);
  assert.match(lookup, /\/api\/market\/exchange\/listing-profile/);
  assert.match(lookup, /\/api\/market\/listing-profile/);
});

test("first-party listing evidence is labelled as Taiseel inventory in the three-layer profile", async () => {
  const profile = await read("../src/components/map/BuyerPropertyProfile.tsx");
  assert.match(profile, /Verified Taiseel Exchange listing attached/);
  assert.match(profile, /Taiseel publication status/);
  assert.match(profile, /Listing reference/);
});

test("database readiness requires both independent listing-link relations", async () => {
  const database = await read("../src/lib/reja-database.ts");
  assert.match(database, /to_regclass\('reja\.market_listing_parcel_links'\)[\s\S]*to_regclass\('reja\.exchange_listing_parcel_links'\)/);
  assert.match(database, /exchange_listing_parcel_links: boolean/);
  assert.match(database, /independently reviewed Taiseel listing-to-parcel links/);
});
