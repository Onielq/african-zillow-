import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";

const read = (file) => fs.readFile(new URL(file, import.meta.url), "utf8");

test("the filter trigger is icon-only and opens a framed secondary navigation row", async () => {
  const source = await read("../src/components/map/MapExperience.tsx");
  const triggerStart = source.indexOf('aria-label="Filters"');
  assert.notEqual(triggerStart, -1);
  const triggerEnd = source.indexOf("</button>", triggerStart);
  const trigger = source.slice(triggerStart, triggerEnd);
  assert.match(trigger, /SlidersHorizontal/);
  assert.match(trigger, /aria-expanded=\{filtersOpen\}/);
  assert.doesNotMatch(trigger, />\s*Filters\s*</);
  assert.match(source, /className="map-filter-subnav"/);
  assert.match(source, /id="map-filter-subnav"/);
});

test("all six primary filter cells open distinct menus", async () => {
  const source = await read("../src/components/map/MapExperience.tsx");
  for (const label of ["Sale / Rent", "Price", "Property type", "Zoning", "Measurement", "Beds / Baths"]) {
    assert.ok(source.includes(label), "missing filter: " + label);
  }
  for (const menu of ["sale", "price", "property", "zoning", "measurement", "bedsBaths"]) {
    assert.match(source, new RegExp('activeFilterMenu === "' + menu + '"'));
  }
  assert.ok((source.match(/aria-haspopup="dialog"/g) ?? []).length >= 6);
});

test("price maximum is taken from the exact inventory scope, not a fixed trillion or rounded parcel estimate", async () => {
  const source = await read("../src/components/map/MapExperience.tsx");
  const mapView = await read("../src/components/map/MapView.tsx");
  const api = await read("../src/app/api/market/filter-inventory/route.ts");
  assert.match(source, /activePriceLimit = marketInventory\?\.maximum/);
  assert.match(source, /inventoryScopeKey/);
  assert.match(source, /scopeLevel: inventoryScope\.level/);
  assert.match(source, /fetch\("\/api\/market\/filter-inventory\?/);
  assert.doesNotMatch(source, /dynamicParcelPriceLimit/);
  assert.doesNotMatch(api, /1_000_000_000_000/);
  assert.match(api, /max\(amount\) AS maximum/);
  assert.match(api, /lower\(l\.district_label\) = lower\(\$\{district\}\)/);
  assert.match(api, /lower\(p\.district_label\) = lower\(\$\{district\}\)/);
  assert.match(mapView, /scope,/);
});

test("price distribution is a frequency histogram of authorized asking prices", async () => {
  const source = await read("../src/components/map/MapExperience.tsx");
  const api = await read("../src/app/api/market/filter-inventory/route.ts");
  assert.match(source, /marketInventory\?\.histogram/);
  assert.match(source, /map-filter-histogram-bars/);
  assert.match(source, /pointer-events: none|map-filter-histogram-bar/);
  assert.match(api, /count\(\*\)::integer AS count/);
  assert.match(api, /reja\.market_listings/);
  assert.match(api, /s\.license_status = 'permitted'/);
  assert.match(api, /s\.commercial_use_allowed IS TRUE/);
  assert.match(api, /s\.redistribution_allowed IS TRUE/);
  assert.match(api, /s\.caching_allowed IS TRUE/);
  assert.match(api, /reja\.exchange_listings/);
  assert.match(api, /reja\.has_verified_listing_authorization/);
  assert.doesNotMatch(source, /transaction-price benchmarks and parcel area/);
  assert.doesNotMatch(source, /not verified asking prices/);
});

test("price tabs have distinct list and finance inputs", async () => {
  const source = await read("../src/components/map/MapExperience.tsx");
  const api = await read("../src/app/api/market/filter-inventory/route.ts");
  assert.match(source, /className="map-filter-price-tabs"/);
  assert.match(source, /activePriceTab === "list"/);
  assert.match(source, /activePriceTab === "monthly"/);
  assert.match(source, /Down payment/);
  assert.match(source, /Annual interest rate/);
  assert.match(source, /Loan term \(months\)/);
  assert.match(source, /principal and interest only/);
  assert.match(api, /estimated_monthly_principal_and_interest_from_authorized_asking_prices/);
  assert.match(api, /GREATEST\(asking_amount - \$\{downPayment\}, 0\)/);
  assert.match(api, /annualRate/);
  assert.match(api, /loanMonths/);
});

test("map listing markers use the amount for the selected price mode", async () => {
  const source = await read("../src/components/map/MapExperience.tsx");
  const mapView = await read("../src/components/map/MapView.tsx");
  const api = await read("../src/app/api/market/filter-inventory/route.ts");
  assert.match(source, /Number\(row\.filter_amount \|\| row\.asking_amount\)/);
  assert.match(source, /marketListings=\{marketMapListings\}/);
  assert.match(mapView, /market-listing-markers/);
  assert.match(mapView, /market-listing-circles/);
  assert.match(api, /AS filter_amount/);
});

test("bedrooms and bathrooms remain enabled in one vertically stacked card", async () => {
  const source = await read("../src/components/map/MapExperience.tsx");
  const styles = await read("../src/app/globals.css");
  assert.match(source, /Bedrooms/);
  assert.match(source, /Bathrooms/);
  assert.match(source, /Use exact match/);
  assert.match(source, /bedroomsMin/);
  assert.match(source, /bathroomsMin/);
  assert.doesNotMatch(source, /bedsBathsDisabled/);
  assert.match(source, /disabled=\{!mapFilters\.bedroomsMin\}/);
  assert.match(source, /disabled=\{!mapFilters\.bathroomsMin\}/);
  assert.match(styles, /\.map-filter-beds-columns\s*\{[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(styles, /\.map-filter-beds-section \+ \.map-filter-beds-section\s*\{[\s\S]*?border-top/);
  assert.match(source, /propertyTypes/);
  assert.match(source, /marketInventory\?\.total/);
});

test("zoning selection does not add a redundant selected-zone summary card", async () => {
  const source = await read("../src/components/map/MapExperience.tsx");
  assert.match(source, /Main zoning/);
  assert.match(source, /Forestation/);
  assert.match(source, /Other zoning/);
  assert.match(source, /aria-pressed=\{mapFilters\.zoningCodes\.includes\(code\)\}/);
  assert.doesNotMatch(source, /map-filter-selected-zone-summary/);
  assert.match(source, /Planning standards/);
  assert.match(source, /KIGALI_ZONE_PLOT_RULES/);
  assert.match(source, /No verified plot-size rule is indexed/);
  assert.match(source, /National Land Authority master plans/);
});

test("the zoning information panel only presents indexed Kigali rules for Kigali districts", async () => {
  const source = await read("../src/components/map/MapExperience.tsx");
  assert.match(source, /Gasabo/);
  assert.match(source, /Kicukiro/);
  assert.match(source, /Nyarugenge/);
  assert.match(source, /R1: "New R1 plots: maximum 500 m²/);
  assert.match(source, /R1A: "Maximum plot size: 300 m²/);
  assert.match(source, /R2: "Rowhousing plots: maximum 200 m²/);
  assert.match(source, /R3: "Incremental single-family plots in new subdivision plans: maximum 100 m²/);
  assert.match(source, /R4: "Minimum plot size: 750 m²/);
  assert.match(source, /Plots below 300 m² follow R1A rules/);
});

test("zoning uses exact parcel-polygon intersection and keeps all parcel boundaries visible", async () => {
  const mapView = await read("../src/components/map/MapView.tsx");
  assert.match(mapView, /fetch\("\/api\/geography\/zoning\?bbox=/);
  assert.match(mapView, /zoningFeatureMatchesCodes/);
  assert.match(mapView, /geometriesIntersect\(feature\.geometry as Geometry, zone\.geometry as Geometry \| null\)/);
  assert.match(mapView, /function polygonIntersectsPolygon/);
  assert.match(mapView, /function segmentsIntersect/);
  assert.match(mapView, /const renderedParcelData: MapFeatureCollection/);
  assert.match(mapView, /features: raw\.features\.map/);
  assert.match(mapView, /source\?\.setData\(renderedParcelData\)/);
  assert.match(mapView, /filter_active: hasParcelFilters/);
  assert.match(mapView, /filter_match: !hasParcelFilters \|\| matchedParcelIds\.has\(id\)/);
  assert.doesNotMatch(mapView, /source\?\.setData\(\{ \.\.\.raw, features: filtered \}/);
});

test("zoning code matcher checks the available zoning and land-use source fields", async () => {
  const mapView = await read("../src/components/map/MapView.tsx");
  assert.match(mapView, /Object\.entries\(properties\)/);
  assert.match(mapView, /zoning\|zone\|land\.\?use\|gen\.\?lu\|lu\.\?code/i);
  assert.match(mapView, /properties\.zoning|properties\.zone_code/);
});

test("measurement ranges are independent, attractive and locally clearable", async () => {
  const source = await read("../src/components/map/MapExperience.tsx");
  const styles = await read("../src/app/globals.css");
  assert.match(source, /Plot area/);
  assert.match(source, /Interior area/);
  assert.match(source, /measurementMin/);
  assert.match(source, /measurementMax/);
  assert.match(source, /0–300/);
  assert.match(source, /300–500/);
  assert.match(source, /500–700/);
  assert.match(source, /700–800/);
  assert.match(source, /800\+/);
  assert.match(source, /Clear measurement/);
  assert.match(styles, /\.map-filter-clear-local/);
  assert.match(source, /measurementBasis: "plot", measurementMin: "", measurementMax: ""/);
  assert.match(source, /measurementBasis: "interior", measurementMin: "", measurementMax: ""/);
});

test("filter popovers reposition after internal content changes", async () => {
  const source = await read("../src/components/map/MapExperience.tsx");
  assert.match(source, /new ResizeObserver\(updatePosition\)/);
  assert.match(source, /observer\.observe\(popover\)/);
  assert.match(source, /observer\?\.disconnect\(\)/);
});

test("market inventory is not fabricated when production has no authorized database connection", async () => {
  const api = await read("../src/app/api/market/filter-inventory/route.ts");
  assert.match(api, /createRejaReadOnlyDatabase\(\)/);
  assert.match(api, /verifyRejaReadOnlyRole\(database\)/);
  assert.match(api, /dataStatus: "not_configured"/);
  assert.match(api, /No listing prices or property distribution are being inferred/);
  assert.match(api, /No eligible, source-authorized current asking-price listings/);
});

test("map parcel filters use cadastral measurements without pretending parcels have building rooms", async () => {
  const mapView = await read("../src/components/map/MapView.tsx");
  assert.match(mapView, /properties\.parcel_size_m2 === "number"/);
  assert.match(mapView, /geometryAreaM2\(feature\.geometry as Geometry\)/);
  assert.match(mapView, /filters\.measurementBasis === "plot"/);
  assert.match(mapView, /minArea !== null/);
  assert.match(mapView, /maxArea !== null/);
});
