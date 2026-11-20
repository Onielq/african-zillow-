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
  assert.match(mapView, /const values = Object\.entries\(properties\)/);
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
  assert.match(source, /Clear entered measurements/);
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

test("building and project room counts come from linked REJA development units", async () => {
  const api = await read("../src/app/api/market/filter-inventory/route.ts");
  assert.match(api, /LEFT JOIN reja\.development_units u ON u\.id = p\.development_unit_id/);
  assert.match(api, /COALESCE\(p\.bedrooms, u\.bedrooms\)/);
  assert.match(api, /COALESCE\(p\.bathrooms, u\.bathrooms\)/);
  assert.match(api, /COALESCE\(p\.internal_area_sqm, u\.internal_area_sqm\)/);
  assert.match(api, /COALESCE\(p\.plot_area_sqm, u\.plot_area_sqm\)/);
  assert.match(api, /development_units_ready/);
  assert.match(api, /property_unit_link_ready/);
});

test("source and exchange row queries join unit metadata and deduplicate the same property", async () => {
  const api = await read("../src/app/api/market/filter-inventory/route.ts");
  const rowsStart = api.indexOf("const rows = await database");
  const exchangeStart = api.indexOf("const exchangeRows = await database");
  const sourceRows = api.slice(rowsStart, exchangeStart);
  const exchangeRows = api.slice(exchangeStart);
  assert.match(sourceRows, /LEFT JOIN reja\.development_units u/);
  assert.match(sourceRows, /LEFT JOIN reja\.development_projects dp/);
  assert.match(sourceRows, /LEFT JOIN reja\.development_buildings db/);
  assert.match(exchangeRows, /LEFT JOIN reja\.development_units u/);
  assert.match(exchangeRows, /LEFT JOIN reja\.development_projects dp/);
  assert.match(exchangeRows, /LEFT JOIN reja\.development_buildings db/);
  assert.match(api, /new Map<string, \(typeof rows\)\[number\]\>/);
  assert.match(api, /for \(const row of exchangeRows\) deduplicatedRows\.set/);
});
test("map parcel filters use cadastral measurements without pretending parcels have building rooms", async () => {
  const mapView = await read("../src/components/map/MapView.tsx");
  assert.match(mapView, /properties\.parcel_size_m2 === "number"/);
  assert.match(mapView, /geometryAreaM2\(feature\.geometry as Geometry\)/);
  assert.match(mapView, /filters\.measurementBasis === "plot"/);
  assert.match(mapView, /minArea !== null/);
  assert.match(mapView, /maxArea !== null/);
});


test("measurement presets select on first click and clear on the second click", async () => {
  const source = await read("../src/components/map/MapExperience.tsx");
  assert.match(source, /current\.measurementPreset === preset\.value\s*\? \{ \.\.\.current, measurementPreset: "", measurementMin: "", measurementMax: "" \}/);
  assert.match(source, /measurementPreset: preset\.value, measurementMin: preset\.min, measurementMax: preset\.max/);
  assert.match(source, /Clear entered measurements/);
  assert.match(source, /\(mapFilters\.measurementMin \|\| mapFilters\.measurementMax\) && !mapFilters\.measurementPreset/);
});

test("measurement and room filters provide a See results action", async () => {
  const source = await read("../src/components/map/MapExperience.tsx");
  assert.match(source, /measurementResultCount/);
  assert.match(source, /See " \+ \(measurementResultCount/);
  assert.match(source, /marketInventory\?\.total/);
  assert.match(source, /See " \+ \(marketInventory\?\.total/);
  assert.match(source, /Bedrooms/);
  assert.match(source, /Bathrooms/);
});

test("monthly payment does not render a histogram; list price retains the histogram and draggable handles", async () => {
  const source = await read("../src/components/map/MapExperience.tsx");
  const listStart = source.indexOf('activePriceTab === "list" ?');
  const monthlyStart = source.indexOf('<div className="map-filter-monthly-content">', listStart);
  const listPanel = source.slice(listStart, monthlyStart);
  const monthlyEnd = source.indexOf('</div>\n                    </div>\n                    <div className="map-filter-result-footer">', monthlyStart);
  const monthlyPanel = source.slice(monthlyStart, monthlyEnd);
  assert.notEqual(listStart, -1);
  assert.notEqual(monthlyStart, -1);
  assert.match(listPanel, /map-filter-histogram/);
  assert.match(listPanel, /type="range"/);
  assert.match(listPanel, /updatePriceSlider\("list"/);
  assert.doesNotMatch(monthlyPanel, /map-filter-histogram/);
  assert.doesNotMatch(monthlyPanel, /type="range"/);
  assert.match(source, /className="map-filter-price-content"/);
  assert.match(source, /className="map-filter-monthly-content"/);
  assert.doesNotMatch(listPanel, /disabled=\{activePriceLimit/);
  assert.match(source, /fallbackPriceScale/);
  assert.match(source, /No verified inventory maximum is connected/);
});

test("filter money and area inputs show thousands separators", async () => {
  const source = await read("../src/components/map/MapExperience.tsx");
  assert.match(source, /new Intl\.NumberFormat\("en-US", \{\s*useGrouping: true/);
  assert.match(source, /function formatGroupedInput/);
  assert.match(source, /function GroupedNumericInput/);
  assert.match(source, /GroupedNumericInput ariaLabel="List price minimum"/);
  assert.match(source, /GroupedNumericInput ariaLabel="List price maximum"/);
  assert.match(source, /GroupedNumericInput ariaLabel="Minimum area in square metres"/);
  assert.match(source, /GroupedNumericInput ariaLabel="Maximum area in square metres"/);
  assert.match(source, /GroupedNumericInput ariaLabel="Down payment amount"/);
});

test("land and lots are one property category", async () => {
  const source = await read("../src/components/map/MapExperience.tsx");
  assert.match(source, /value: "land", label: "Land & lots"/);
  assert.doesNotMatch(source, /value: "lots_land", label: "Lots & Land"/);
  assert.doesNotMatch(source, /const isLand = option\.value === "land" \|\| option\.value === "lots_land"/);
  assert.match(source, /nextTypes\.every\(\(value\) => value === "land"\)/);
});

test("current location is available through the map's geolocation control", async () => {
  const mapView = await read("../src/components/map/MapView.tsx");
  const styles = await read("../src/app/globals.css");
  assert.match(mapView, /GeolocateControl/);
  assert.match(mapView, /enableHighAccuracy: true/);
  assert.match(mapView, /trackUserLocation: false/);
  assert.match(mapView, /showUserLocation: true/);
  assert.match(mapView, /showAccuracyCircle: true/);
  assert.match(mapView, /fitBoundsOptions: \{ maxZoom: 16\.5 \}/);
  assert.match(mapView, /"top-right"/);
  assert.match(styles, /\.maplibregl-ctrl-geolocate/);
});

test("map filter selected states use high-contrast amber without changing the global brand palette", async () => {
  const styles = await read("../src/app/globals.css");
  assert.match(styles, /--map-filter-accent: #B45309/);
  assert.match(styles, /--map-filter-accent-tint: #FFF1DF/);
  assert.match(styles, /\.map-filter-trigger-active[\s\S]*?var\(--map-filter-accent\)/);
  assert.match(styles, /\.map-filter-area-preset-active[\s\S]*?var\(--map-filter-accent\)/);
  assert.match(styles, /\.map-filter-dual-slider-range[\s\S]*?var\(--map-filter-accent\)/);
  assert.match(styles, /\.map-filter-price-tab-active[\s\S]*?var\(--map-filter-accent\)/);
});

test("panning and zooming prompt an explicit geographic search with a visible progress state and result count", async () => {
  const mapView = await read("../src/components/map/MapView.tsx");
  const styles = await read("../src/app/globals.css");
  assert.match(mapView, /map-area-search-control/);
  assert.match(mapView, /Search this area/);
  assert.match(mapView, /Searching…/);
  assert.match(mapView, /Refreshing boundaries and map layers/);
  assert.match(mapView, /Search again/);
  assert.match(mapView, /in this view/);
  assert.match(mapView, /aria-live/);
  assert.match(mapView, /Promise\.all\(searchTasks\)/);
  assert.match(mapView, /markViewportSearchPending\(\)/);
  assert.match(styles, /\.map-area-search-control/);
  assert.match(styles, /\.map-area-search-button/);
});

test("camera movement does not silently launch another area search", async () => {
  const mapView = await read("../src/components/map/MapView.tsx");
  const browserSmoke = await read("../scripts/e2e-map-parcels.mjs");
  assert.match(browserSmoke, /async function searchCurrentArea\(\)/);
  assert.match(browserSmoke, /await page\.locator\("\.map-area-search-button"\)\.click\(\)/);
  assert.match(browserSmoke, /loadingState !== "loading"/);
  assert.match(browserSmoke, /viewportSearchChecks/);
  const scheduleStart = mapView.indexOf("const scheduleRefresh = () =>");
  const scheduleEnd = mapView.indexOf("\n    };", scheduleStart);
  const schedule = mapView.slice(scheduleStart, scheduleEnd);
  assert.notEqual(scheduleStart, -1);
  assert.doesNotMatch(schedule, /scheduleShowOverlayRefresh\(\)/);
  assert.doesNotMatch(schedule, /scheduleZoningRefresh\(\)/);
  assert.doesNotMatch(schedule, /refreshAreas\(\)/);
  assert.match(mapView, /lastSearchedViewportKey = requestedViewportKey/);
  assert.match(mapView, /visibleIds\.size\.toLocaleString/);
  assert.match(mapView, /No mapped " \+ unit \+ " in this view/);
});

test("price tab switching keeps a stable popover placement", async () => {
  const source = await read("../src/components/map/MapExperience.tsx");
  const styles = await read("../src/app/globals.css");
  assert.match(source, /placementRef = useRef<"below" \| "above" \| null>\(null\)/);
  assert.match(source, /placementRef\.current = roomBelow >= 280 \|\| roomBelow >= roomAbove \? "below" : "above"/);
  assert.match(source, /maxHeight: availableHeight/);
  assert.match(styles, /\.map-filter-price-content\s*\{[\s\S]*?min-height: 320px/);
  assert.match(styles, /\.map-filter-monthly-content\s*\{[\s\S]*?min-height: 320px/);
});
