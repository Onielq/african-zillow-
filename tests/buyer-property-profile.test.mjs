import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const readProjectFile = (path) => readFile(join(root, path), "utf8");

test("selected cadastral parcels render one buyer profile with three independent intelligence layers", async () => {
  const experience = await readProjectFile("src/components/map/MapExperience.tsx");
  const profile = await readProjectFile("src/components/map/BuyerPropertyProfile.tsx");

  assert.match(experience, /import \{ BuyerPropertyProfile \}/);
  assert.match(experience, /<BuyerPropertyProfile[\s\S]*?area=\{selectedArea\}/);
  assert.match(profile, /Land Intelligence/);
  assert.match(profile, /Development &amp; Regulatory Intelligence/);
  assert.match(profile, /Marketplace &amp; Market Intelligence/);
  assert.match(profile, /UPI \{area\.upi\}/);
  assert.match(profile, /area\.parcelSizeSource === "geometry-estimate"/);
  assert.match(profile, /area\.parcelSizeSource === "cadastral-attribute"/);
});

test("buyer profile does not turn a project match into regulatory approval", async () => {
  const profile = await readProjectFile("src/components/map/BuyerPropertyProfile.tsx");

  assert.match(profile, /Exact-UPI project match/);
  assert.match(profile, /Formal registration, authority approvals and regulatory-compliance evidence are not connected/);
  assert.match(profile, /This does not prove that no development affects the land/);
});

test("buyer profile keeps asking prices, area benchmarks and completed sales distinct", async () => {
  const experience = await readProjectFile("src/components/map/MapExperience.tsx");
  const profile = await readProjectFile("src/components/map/BuyerPropertyProfile.tsx");

  assert.match(experience, /"Calculated estimate"/);
  assert.match(experience, /area × average transaction price per m²/);
  assert.match(profile, /Area-level transaction-price signal/);
  assert.match(profile, /This is not this parcel's sale price/);
  assert.match(profile, /No parcel-specific completed-sale record is connected/);
  assert.match(profile, /Advertiser identity and a verified comparable-listing set are not connected/);
});

test("listing records cannot be joined to a parcel using proximity alone", async () => {
  const contract = await readProjectFile("docs/BUYER_PROPERTY_INTELLIGENCE.md");
  const architecture = await readProjectFile("docs/ARCHITECTURE.md");

  assert.match(contract, /independently checked listing-to-UPI relationship/);
  assert.match(contract, /Do not link a listing to a parcel using nearest coordinates/);
  assert.match(architecture, /Never use nearest coordinates/);
  assert.match(contract, /does not prove legal ownership, title/);
});
