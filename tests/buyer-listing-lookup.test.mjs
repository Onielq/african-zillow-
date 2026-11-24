import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFile(join(root, path), "utf8");

test("buyer listing lookup requires a source key and source-owned listing ID", async () => {
  const lookup = await read("src/components/map/BuyerListingLookup.tsx");
  assert.match(lookup, /Listing source key/);
  assert.match(lookup, /Source listing ID/);
  assert.match(lookup, /new URLSearchParams\(\{ sourceKey: source, listingId: id \}\)/);
  assert.match(lookup, /\/api\/market\/listing-profile/);
  assert.match(lookup, /The source's own listing ID/);
});

test("unlinked listings remain separate and multiple parcel links require an explicit choice", async () => {
  const lookup = await read("src/components/map/BuyerListingLookup.tsx");
  assert.match(lookup, /result\.parcelLinks\.length === 0/);
  assert.match(lookup, /No verified parcel link/);
  assert.match(lookup, /result\.parcelLinks\.length === 1/);
  assert.match(lookup, /result\.parcelLinks\.map/);
  assert.match(lookup, /Choose the linked parcel/);
  assert.match(lookup, /No location is guessed/);
});

test("listing-to-parcel navigation requires exactly one cadastral result for the verified UPI", async () => {
  const experience = await read("src/components/map/MapExperience.tsx");
  assert.match(experience, /const openBuyerListingParcel = async/);
  assert.match(experience, /\/api\/geography\/areas\/search\?q=/);
  assert.match(experience, /area\.level === "parcel"/);
  assert.match(experience, /area\.upi\?\.trim\(\)\.toLocaleUpperCase\("en"\)/);
  assert.match(experience, /exactMatches\.length !== 1/);
  assert.match(experience, /No location was guessed/);
  assert.match(experience, /<BuyerListingLookup onParcelSelected=\{openBuyerListingParcel\}/);
});

test("verified listing context is shown inside the three-layer property profile only for the linked UPI", async () => {
  const experience = await read("src/components/map/MapExperience.tsx");
  const profile = await read("src/components/map/BuyerPropertyProfile.tsx");
  assert.match(experience, /linkedListing=\{selectedBuyerListing\?\.link\.upi === selectedArea\.upi/);
  assert.match(experience, /listingParcelLink=\{selectedBuyerListing\?\.link\.upi === selectedArea\.upi/);
  assert.match(profile, /Verified source listing attached/);
  assert.match(profile, /Asking price:/);
  assert.match(profile, /Source-reported status:/);
  assert.match(profile, /Source attribution is required/);
  assert.match(profile, /completed-sale record is connected/);
});

test("buyer listing lookup never treats an advertised location as parcel identity", async () => {
  const lookup = await read("src/components/map/BuyerListingLookup.tsx");
  const route = await read("src/app/api/market/listing-profile/route.ts");
  assert.match(lookup, /no parcel link/);
  assert.match(route, /independently verified UPI relationships/);
  assert.doesNotMatch(lookup + route, /ST_DWithin|ST_Distance|nearest coordinates|coordinates match/i);
});
