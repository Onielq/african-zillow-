import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const readProjectFile = (path) => readFile(join(root, path), "utf8");

test("the administrative API restricts requests to the four pilot districts", async () => {
  const route = await readProjectFile("src/app/api/geography/areas/route.ts");
  assert.match(route, /Gasabo/i);
  assert.match(route, /Kicukiro/i);
  assert.match(route, /Nyarugenge/i);
  assert.match(route, /Bugesera/i);
  assert.match(route, /Masterplan2020_22Apr2026\/MapServer/);
  assert.match(route, /Overlays\/Bugesera_Masterplan\/MapServer/);
  assert.match(route, /Kigali_Parcels_1June2026_for_search\/FeatureServer\/0/);
  assert.match(route, /Bugesera_Parcels\/FeatureServer\/0/);
  assert.match(route, /cellule_1/);
  assert.match(route, /code_cell_/);
  assert.match(route, /district, sector, cell, village, or parcel/);
  assert.match(route, /district: 4, sector: 5, cell: 6, village: 7/);
  assert.match(route, /district: 2, sector: 4, cell: 3, village: 5/);
  assert.match(route, /geometryType/);
  assert.match(route, /arcGisPolygonToGeoJson/);
  assert.match(route, /f: "json"/);
});

test("administrative boundaries render per GIS source and reuse cached viewport geometry", async () => {
  const route = await readProjectFile("src/app/api/geography/areas/route.ts");
  const mapView = await readProjectFile("src/components/map/MapView.tsx");

  assert.match(route, /source must be kigali or bugesera/);
  assert.match(route, /sourceFilter\?\: "kigali" \| "bugesera"/);
  assert.match(route, /revalidateSeconds = 300/);
  assert.match(route, /s-maxage=3600, stale-while-revalidate=86400/);
  assert.match(mapView, /AREA_QUERY_GRIDS/);
  assert.match(mapView, /const areaCache = new Map/);
  assert.match(mapView, /source=\$\{adminSource\}/);
  assert.match(mapView, /publishLevel\(level\)/);
  assert.match(mapView, /reportActiveReady\(\)/);
});

test("the map view progressively switches administrative levels and increases boundary opacity", async () => {
  const mapView = await readProjectFile("src/components/map/MapView.tsx");
  assert.match(mapView, /SECTOR_ZOOM/);
  assert.match(mapView, /CELL_ZOOM/);
  assert.match(mapView, /VILLAGE_ZOOM/);
  assert.match(mapView, /PARCEL_ZOOM/);
  assert.match(mapView, /cellNameByCode/);
  assert.match(mapView, /source: "land-parcels"/);
  assert.match(mapView, /district-fill/);
  assert.match(mapView, /sector-fill/);
  assert.match(mapView, /cell-fill/);
  assert.match(mapView, /village-fill/);
  assert.match(mapView, /fitBounds/);
  assert.match(mapView, /setFeatureState/);
  assert.match(mapView, /0\.2/);
  assert.match(mapView, /0\.42/);
  assert.match(mapView, /0\.5/);
  assert.match(mapView, /if \(zoom >= PARCEL_ZOOM\) return "parcel"/);
});

test("cadastral outlines and parcel geometry are active from village zoom", async () => {
  const mapView = await readProjectFile("src/components/map/MapView.tsx");

  assert.match(mapView, /if \(activeLevel === "village"\) requestedLevels\.push\("parcel"\)/);
  assert.match(mapView, /const showParcelBoundaries = activeIndex >= villageIndex/);
  assert.match(mapView, /level === "parcel" && showParcelBoundaries/);
  assert.match(mapView, /requestedLevelSet = new Set\(requestedLevels\)/);
  assert.match(mapView, /sourceListsMultipleCodes/);
});

test("the map idle fallback does not race the queued viewport refresh and abort cadastral requests", async () => {
  const mapView = await readProjectFile("src/components/map/MapView.tsx");
  const scheduledRefresh = mapView.slice(mapView.indexOf("const scheduleRefresh = () =>"), mapView.indexOf("const setHover = (", mapView.indexOf("const scheduleRefresh = () =>")));
  const idleFallback = mapView.slice(mapView.indexOf('map.once("idle", () =>'), mapView.indexOf('if (!viewportListenersAttached)', mapView.indexOf('map.once("idle", () =>')));

  assert.match(scheduledRefresh, /refreshTimer = setTimeout\(\(\) => \{[\s\S]*?refreshTimer = null;[\s\S]*?void refreshAreas\(\);/);
  assert.match(idleFallback, /if \(needsRefresh\) \{[\s\S]*?clearTimeout\(refreshTimer\);[\s\S]*?refreshTimer = null;[\s\S]*?void refreshAreas\(\);/);
  assert.match(mapView, /const refreshKey = \[/);
  assert.match(mapView, /activeRefreshKey === refreshKey/);
  assert.match(mapView, /area-refresh-skipped-duplicate/);
  assert.match(mapView, /if \(activeController === controller\) \{[\s\S]*?activeController = null;[\s\S]*?activeRefreshKey = null;/);
});

test("zoning codes are separated when a source record combines short codes and sources live in the Sources panel", async () => {
  const route = await readProjectFile("src/app/api/geography/parcel-zoning/route.ts");
  const experience = await readProjectFile("src/components/map/MapExperience.tsx");

  assert.match(route, /splitSimpleZoneCodes/);
  assert.match(route, /sourceListsMultipleCodes: true/);
  assert.match(experience, /Multiple mapped designations/);
  assert.match(experience, /The source lists several codes in one record/);
  assert.doesNotMatch(experience, /parcel-zoning-source/);
  assert.match(experience, /Planning and zoning/);
  assert.match(experience, /Open Kigali zoning layer/);
  assert.match(experience, /Open Bugesera zoning layer/);
});

test("parcel boundary requests preserve source vertices and use a precise viewport envelope", async () => {
  const route = await readProjectFile("src/app/api/geography/areas/route.ts");
  const mapView = await readProjectFile("src/components/map/MapView.tsx");

  assert.match(route, /Number\(west\.toFixed\(6\)\)/);
  assert.match(route, /Number\(south\.toFixed\(6\)\)/);
  assert.match(route, /do not set maxAllowableOffset/i);
  assert.match(route, /returnGeometry: "true"/);
  assert.match(mapView, /toFixed\(6\)\)\.join\(","\)/);
  assert.match(mapView, /PARCEL_ZOOM \+ 3\.85/);
  assert.match(mapView, /feature-state.*selected/s);
});

test("average transaction price is the valuation basis and reference price remains a separate benchmark", async () => {
  const route = await readProjectFile("src/app/api/geography/areas/route.ts");
  const mapView = await readProjectFile("src/components/map/MapView.tsx");
  const experience = await readProjectFile("src/components/map/MapExperience.tsx");
  const benchmarks = await readProjectFile("src/data/land-price-benchmarks.ts");

  assert.match(route, /DISTRICT_AVERAGE_TRANSACTION_PRICE_RWF_PER_M2/);
  assert.match(route, /land-price-transaction\.tsv/);
  assert.match(benchmarks, /averageTransactionPricePerM2: 36103/);
  assert.match(benchmarks, /averageTransactionPricePerM2: 61499/);
  assert.match(benchmarks, /averageTransactionPricePerM2: 50865/);
  assert.match(benchmarks, /averageTransactionPricePerM2: 4038/);
  assert.match(benchmarks, /averageReferencePricePerM2: 19976/);
  assert.match(benchmarks, /averageReferencePricePerM2: 27914/);
  assert.match(benchmarks, /averageReferencePricePerM2: 28077/);
  assert.match(benchmarks, /averageReferencePricePerM2: 1145/);
  assert.match(benchmarks, /94 RWF\/m² difference/);
  assert.match(mapView, /showLandPriceHeatmap/);
  assert.match(mapView, /average_land_price_per_m2/);
  assert.match(mapView, /LAND_PRICE_RAMP/);
  assert.match(experience, /Average transaction price \/ m²/);
  assert.match(experience, /Average reference price · district benchmark/);
  assert.match(experience, /estimatedReferenceBenchmark/);
  assert.match(experience, /observation date and weighting method are not disclosed/i);
  assert.match(experience, /district-level land prices are not a valid substitute/i);
});

test("the map cannot zoom out past the Rwanda extent and constrains panning", async () => {
  const mapView = await readProjectFile("src/components/map/MapView.tsx");
  assert.match(mapView, /RWANDA_CAMERA_BOUNDS/);
  assert.match(mapView, /maxBounds: RWANDA_CAMERA_BOUNDS/);
  assert.match(mapView, /cameraForBounds\(RWANDA_CAMERA_BOUNDS/);
  assert.match(mapView, /map\.setMinZoom/);
  assert.match(mapView, /updateRwandaZoomFloor\(\)/);
});

test("the map supports a satellite basemap without removing administrative overlays", async () => {
  const mapView = await readProjectFile("src/components/map/MapView.tsx");
  const experience = await readProjectFile("src/components/map/MapExperience.tsx");
  const css = await readProjectFile("src/app/globals.css");

  assert.match(mapView, /SATELLITE_STYLE/);
  assert.match(mapView, /World_Imagery/);
  assert.match(mapView, /Imagery © Esri/);
  assert.match(mapView, /map\.setStyle\(basemapMode === "map"/);
  assert.match(experience, /aria-label="Basemap view"/);
  assert.match(experience, /setBasemapMode\("satellite"\)/);
  assert.match(experience, /setBasemapMode\("map"\)/);
  assert.match(css, /\.basemap-switcher/);
});

test("the investment workspace exposes six metrics, property scope, and period filters", async () => {
  const experience = await readProjectFile("src/components/map/MapExperience.tsx");

  for (const metric of [
    "averageLandPricePerM2",
    "transactionVolume",
    "capitalAppreciation",
    "rentalYield",
    "marketSupply",
    "upcomingSupply"
  ]) {
    assert.match(experience, new RegExp(metric));
  }

  assert.match(experience, /aria-label="Market metric"/);
  assert.match(experience, /aria-label="Property type"/);
  assert.match(experience, /aria-label="Analysis period"/);
  assert.match(experience, /time series is not connected and validated here/i);
  assert.match(experience, /No project markers\s+or prices are fabricated/);
});

test("area comparison supports an unrestricted mixed set without fabricating unavailable metrics", async () => {
  const experience = await readProjectFile("src/components/map/MapExperience.tsx");
  const css = await readProjectFile("src/app/globals.css");

  assert.match(experience, /setComparedAreas/);
  assert.doesNotMatch(experience, /comparedAreas\.length >= 4/);
  assert.match(experience, /Add to comparison/);
  assert.match(experience, /No verified project data/);
  assert.match(experience, /Clear shortlist/);
  assert.match(css, /\.comparison-panel/);
});

test("the source register separates connected boundaries from pending market feeds", async () => {
  const experience = await readProjectFile("src/components/map/MapExperience.tsx");
  assert.match(experience, /Market data sources/);
  assert.match(experience, /Administrative boundaries/);
  assert.match(experience, /Land transaction summaries/);
  assert.match(experience, /Average district land prices/);
  assert.match(experience, /Rental yields and house-sale prices/);
  assert.match(experience, /Projects and upcoming supply/);
  assert.match(experience, /https:\/\/data\.gov\.rw\/datasets/);
});

test("the basemap has a documented fallback style", async () => {
  const mapView = await readProjectFile("src/components/map/MapView.tsx");
  assert.match(mapView, /styles\/liberty/);
  assert.match(mapView, /map\.setStyle\(FALLBACK_STYLE_URL\)/);
});

test("Bugesera parcel attributes and UPI-derived location codes are mapped from published fields", async () => {
  const route = await readProjectFile("src/app/api/geography/areas/route.ts");
  const mapView = await readProjectFile("src/components/map/MapView.tsx");
  const experience = await readProjectFile("src/components/map/MapExperience.tsx");

  assert.match(route, /BUGESERA_PARCEL_FEATURE_LAYER/);
  assert.match(route, /upi,province,district,sector,cell,village,parcel_number,size,area_in_wetland,last_updated_on/);
  assert.match(route, /bugeseraLocationIdsFromUpi/);
  assert.match(route, /parcel_size_m2: numberValue/);
  assert.match(route, /sector_id: locationIds\.sectorId/);
  assert.match(route, /cell_id: locationIds\.cellId/);
  assert.match(route, /reuse permission pending/i);
  assert.match(mapView, /villageIdByCellAndName/);
  assert.match(mapView, /ambiguousVillageKeys/);
  assert.match(experience, /Sector \/ ID/);
  assert.match(experience, /Village \/ ID/);
});

test("the UI identifies Kigali parcels without presenting them as proof of ownership", async () => {
  const experience = await readProjectFile("src/components/map/MapExperience.tsx");
  const route = await readProjectFile("src/app/api/geography/areas/route.ts");
  assert.match(experience, /Unique parcel identifier \(UPI\)/);
  assert.match(experience, /Verify legal title before a transaction/);
  assert.match(experience, /Bugesera.*parcel polygons are connected/i);
  assert.match(route, /KIGALI_PARCEL_FEATURE_LAYER/);
  assert.match(route, /upi IS NOT NULL/);
  assert.match(route, /parcel_size_m2/);
  assert.match(route, /wetland_area_m2/);
});

test("hydration warning suppression is scoped to the body element", async () => {
  const layout = await readProjectFile("src/app/layout.tsx");
  assert.match(layout, /<body suppressHydrationWarning>/);
});

test("redundant map focus panels are removed while reduced-motion support remains", async () => {
  const experience = await readProjectFile("src/components/map/MapExperience.tsx");
  const css = await readProjectFile("src/app/globals.css");
  assert.doesNotMatch(experience, /map-focus-panel|EXPLORE AREA|PARCEL BOUNDARIES/);
  assert.doesNotMatch(css, /map-focus-panel|focus-button|focus-options/);
  assert.match(experience, /prefers-reduced-motion/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test("MapLibre and GSAP are declared dependencies", async () => {
  const packageJson = JSON.parse(await readProjectFile("package.json"));
  assert.ok(packageJson.dependencies["maplibre-gl"]);
  assert.ok(packageJson.dependencies.gsap);
});


test("MapLibre worker and shared modules are copied to a versioned public path", async () => {
  const packageJson = JSON.parse(await readProjectFile("package.json"));
  const mapView = await readProjectFile("src/components/map/MapView.tsx");
  const copyScript = await readProjectFile("scripts/copy-maplibre-worker.mjs");

  assert.match(packageJson.scripts.postinstall, /node scripts\/copy-maplibre-worker\.mjs/);
  assert.match(packageJson.scripts.predev, /node scripts\/copy-maplibre-worker\.mjs/);
  assert.match(packageJson.scripts.prebuild, /node scripts\/copy-maplibre-worker\.mjs/);
  assert.match(mapView, /setWorkerUrl/);
  assert.match(mapView, /vendor\/maplibre-gl/);
  assert.match(copyScript, /maplibre-gl-worker\.mjs/);
  assert.match(copyScript, /maplibre-gl-shared\.mjs/);
});


test("the standalone data source register exposes provenance, limitations, and source links", async () => {
  const page = await readProjectFile("src/app/data-sources/page.tsx");
  const css = await readProjectFile("src/app/data-sources/data-sources.module.css");
  const docs = await readProjectFile("docs/DATA_SOURCE_REGISTER.md");
  const experience = await readProjectFile("src/components/map/MapExperience.tsx");
  const healthRoute = await readProjectFile("src/app/api/data-sources/health/route.ts");

  assert.match(page, /Kigali administrative boundaries/);
  assert.match(page, /Bugesera cadastral parcels/);
  assert.match(page, /Rwanda Data Sharing Platform/);
  assert.match(page, /Population and housing statistics/);
  assert.match(page, /reuse permission/i);
  assert.match(page, /not proof of ownership/i);
  assert.match(page, /data-status/);
  assert.match(page, /Check live connections/);
  assert.match(page, /Reachable/);
  assert.match(healthRoute, /KIGALI_MASTERPLAN|kigali-administrative/);
  assert.match(healthRoute, /bugesera-cadastral/);
  assert.match(healthRoute, /No licence statement declared in service metadata/);
  assert.match(healthRoute, /X-Data-Check/);
  assert.match(healthRoute, /does not validate coverage/);
  assert.match(css, /\.healthGrid/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(docs, /DATA_SOURCE_REGISTER|Data source register/);
  assert.match(docs, /approved sharing/);
  assert.match(experience, /href="\/data-sources"/);
});


test("the reference screen audit and map comparison patterns are implemented without invented metrics", async () => {
  const audit = await readProjectFile("docs/REFERENCE_SCREEN_AUDIT.md");
  const experience = await readProjectFile("src/components/map/MapExperience.tsx");
  const css = await readProjectFile("src/app/globals.css");

  assert.match(audit, /Audit of all 18 reference screenshots/);
  assert.ok(audit.includes("Screenshot 2026-10-19 234441.jpg"));
  assert.ok(audit.includes("Screenshot 2026-10-19 235932.jpg"));
  assert.match(audit, /without permission|Do not redistribute/i);
  assert.match(experience, /comparisonSearchResults/);
  assert.match(experience, /comparison-area-search/);
  assert.match(experience, /comparison-selected-chips/);
  assert.match(experience, /Clear all/);
  assert.match(experience, /lowestComparisonPrice/);
  assert.match(experience, /Lowest comparable price per square metre/);
  assert.match(experience, /aria-modal="true"/);
  assert.match(experience, /area-market-grid/);
  assert.match(experience, /Projects in selected area/);
  assert.match(experience, /Not connected/);
  assert.match(experience, /metric-info-panel/);
  assert.match(experience, /activeMetric\.dataStatus/);
  assert.match(experience, /Expected unit/);
  assert.match(css, /comparison-modal-backdrop/);
  assert.match(css, /area-market-card/);
  assert.match(css, /\.metric-info-panel/);
});


test("the market metrics dropdown presents land-first scope, periods and supply definitions", async () => {
  const experience = await readProjectFile("src/components/map/MapExperience.tsx");
  const css = await readProjectFile("src/app/globals.css");

  assert.match(experience, /aria-label="Market metrics menu"/);
  assert.match(experience, /aria-label="Property type"/);
  assert.match(experience, /aria-label="Analysis period"/);
  assert.match(experience, /"apartment"/);
  assert.match(experience, /"villa"/);
  assert.match(experience, /Market supply means plots currently available for sale and ready to transact/);
  assert.match(experience, /Upcoming supply covers a future pipeline that is not yet ready/);
  assert.match(experience, /Apartment and villa metrics will become available/);
  assert.match(css, /\.metrics-menu/);
});

test("the original cell-price audit file is preserved while valuation reads the transaction-price snapshot", async () => {
  const source = await readProjectFile("public/land-price-reference.tsv");
  const transactionSource = await readProjectFile("public/land-price-transaction.tsv");
  const experience = await readProjectFile("src/components/map/MapExperience.tsx");
  const rows = source.trim().split(/\r?\n/);
  const transactionRows = transactionSource.trim().split(/\r?\n/);

  assert.equal(rows.length, 245);
  assert.equal(rows[0], "PROVINCE\tDISTRICT\tSECTOR\tCELL\tWEIGHTED AVERAGE (RWF/M²)");
  assert.equal(transactionRows.length, 245);
  assert.equal(transactionRows[0], "PROVINCE\tDISTRICT\tSECTOR\tCELL\tWEIGHTED AVERAGE TRANSACTION PRICE (RWF/M²)");
  assert.match(source, /Eastern\tBugesera\tMayange\tKibenga\t6,566/);
  assert.match(transactionSource, /Kigali City\tGasabo\tRemera\tNyarutarama\t218,375/);
  assert.match(experience, /parseLandPriceTransactionPrices/);
  assert.match(experience, /fetch\("\/land-price-transaction\.tsv"\)/);
  assert.match(experience, /conflictingLocations/);
  assert.match(experience, /Conflicting values on source rows/);
  assert.match(experience, /No district average is substituted/);
});

test("developer popup separates developer candidates, agencies and public agent sources", async () => {
  const experience = await readProjectFile("src/components/map/MapExperience.tsx");
  const developerData = await readProjectFile("src/data/developer-directory.ts");
  const agencyData = await readProjectFile("src/data/real-estate-directory.ts");

  assert.match(experience, /aria-label="Developer and agent directory"/);
  assert.match(experience, /Developers &amp; agents/);
  assert.match(experience, /RWANDA_REAL_ESTATE_AGENCIES/);
  assert.match(experience, /RWANDA_PUBLIC_AGENT_CANDIDATES/);
  assert.match(experience, /Public websites are discovery leads/);
  assert.match(experience, /No “top agent” ranking published/);
  assert.match(developerData, /https:\/\/delta-rwanda\.com/);
  assert.match(agencyData, /https:\/\/homeland\.rw/);
});


test("developer drawer renders only sourced logo assets and expands public agent candidates without ranking", async () => {
  const experience = await readProjectFile("src/components/map/MapExperience.tsx");
  const developerData = await readProjectFile("src/data/developer-directory.ts");
  const directoryData = await readProjectFile("src/data/real-estate-directory.ts");

  assert.match(experience, /directory-logo-image/);
  assert.match(experience, /candidate\.logoUrl/);
  assert.match(developerData, /https:\/\/delta-rwanda\.com\/assets\/delta-developers/);
  assert.match(developerData, /pbs\.twimg\.com\/profile_images/);
  assert.match(directoryData, /Arstide Yves Horimbere/);
  assert.match(directoryData, /Grace Uwacu/);
  assert.match(directoryData, /Yassin Musabyimana/);
  assert.match(directoryData, /Gustave Niyonkuru/);
  assert.match(directoryData, /IZERE IRAKIZA Aime Johnson/);
  assert.match(experience, /No “top agent” ranking published/);
});


test("official dashboard price snapshots are provisional and separated from reference prices", async () => {
  const route = await readProjectFile("src/app/api/geography/areas/route.ts");
  const experience = await readProjectFile("src/components/map/MapExperience.tsx");
  const districtSnapshot = await readProjectFile("public/land-price-district-snapshot.tsv");
  const reconciliation = await readProjectFile("public/land-price-reconciliation.tsv");
  const sourceRegister = await readProjectFile("docs/DATA_SOURCE_REGISTER.md");
  const sourceAudit = await readProjectFile("docs/LAND_PRICE_SOURCE_RECONCILIATION.md");

  assert.match(route, /Avg Transaction Price \(m²\)/);
  assert.match(experience, /Snapshot only/);
  assert.match(experience, /Nyarugenge 50,865/);
  assert.match(experience, /Open National Land Dashboard average transaction\/reference prices/);
  assert.match(experience, /Open National Land Dashboard transaction analysis/);
  assert.match(experience, /Open National Land Dashboard ownership/);
  assert.match(experience, /Open National Land Dashboard land use/);

  const districtRows = districtSnapshot.trim().split(/\r?\n/);
  assert.equal(districtRows.length, 5);
  assert.match(districtSnapshot, /Gasabo\t36103/);
  assert.match(districtSnapshot, /Kicukiro\t61499/);
  assert.match(districtSnapshot, /Nyarugenge\t50771/);
  assert.match(districtSnapshot, /Bugesera\t4038/);
  assert.match(districtSnapshot, /Not disclosed in visible source page/);

  const auditRows = reconciliation.trim().split(/\r?\n/);
  assert.equal(auditRows.length, 13);
  assert.match(reconciliation, /Bugesera\tMayange\tKibenga\t6566;10980/);
  assert.match(reconciliation, /Kicukiro\tGahanga\tKagasa\t22236;92377/);
  assert.match(reconciliation, /MALFORMED\t61/);
  assert.match(reconciliation, /MALFORMED\t74/);
  assert.match(reconciliation, /do not average or pick one/);

  for (const url of [
    "https://rwandalanddashboard.lands.rw/",
    "https://rwandalanddashboard.lands.rw/prices",
    "https://rwandalanddashboard.lands.rw/reference",
    "https://rwandalanddashboard.lands.rw/transactions",
    "https://rwandalanddashboard.lands.rw/ownership",
    "https://rwandalanddashboard.lands.rw/land-use"
  ]) {
    assert.ok(sourceRegister.includes(url), `Missing dashboard source link: ${url}`);
  }
  assert.match(sourceAudit, /Nyarugenge figure differs by \*\*94 RWF\/m²\*\*/);
  assert.match(sourceAudit, /observation date of these values is \*\*not confirmed\*\*/);
  assert.match(sourceAudit, /Do not choose the higher value, lower value, mean/);
});


test("Show menu exposes sourced overlays and scopes queries to the active pilot area", async () => {
  const experience = await readProjectFile("src/components/map/MapExperience.tsx");
  const mapView = await readProjectFile("src/components/map/MapView.tsx");
  const places = await readProjectFile("src/app/api/geography/places/route.ts");
  const css = await readProjectFile("src/app/globals.css");

  assert.match(experience, /aria-label="Show map overlays"/);
  assert.match(experience, /title: "Landmarks"/);
  assert.match(experience, /title: "Medical & schools"/);
  assert.match(experience, /title: "Transportation"/);
  assert.match(experience, /title: "Nature"/);
  assert.match(experience, /showScope="pilot"/);
  assert.match(experience, /show-toggle-track/);
  assert.match(experience, /title: "Zoning"|showZoning/);
  assert.match(mapView, /show-road-lines/);
  assert.match(mapView, /show-poi-circles/);
  assert.match(mapView, /showLayersRef/);
  assert.match(places, /OVERPASS_ENDPOINTS/);
  assert.match(places, /KIGALI_EXTENT/);
  assert.match(places, /BUGESERA_EXTENT/);
  assert.match(places, /getPilotDistrictFeatures/);
  assert.match(places, /clipFeatureToDistricts/);
  assert.match(places, /official pilot district polygons/);
  assert.match(places, /© OpenStreetMap contributors, ODbL/);
  assert.match(css, /\.show-menu/);
});

test("cell selection offers UPI parcel inventory and zoom-to-parcel navigation", async () => {
  const experience = await readProjectFile("src/components/map/MapExperience.tsx");
  const parcelRoute = await readProjectFile("src/app/api/geography/cell-parcels/route.ts");
  const mapView = await readProjectFile("src/components/map/MapView.tsx");
  const css = await readProjectFile("src/app/globals.css");

  assert.match(experience, /Land parcels in/);
  assert.match(experience, /cell-parcels/);
  assert.match(experience, /mapInstance\.fitBounds/);
  assert.match(experience, /parcel\.upi/);
  assert.match(parcelRoute, /returnIdsOnly: "true"/);
  assert.match(parcelRoute, /upi IS NOT NULL/);
  assert.match(parcelRoute, /MAX_PARCELS_PER_CELL/);
  assert.match(parcelRoute, /returnGeometry: "true"/);
  assert.match(mapView, /const showOutline = index === activeIndex/);
  assert.match(css, /\.cell-parcel-row/);
});

test("transaction volume explains sourced baselines, model caveats, and current Bugesera discrepancy", async () => {
  const experience = await readProjectFile("src/components/map/MapExperience.tsx");

  assert.match(experience, /Bugesera, Kicukiro, Gasabo and Nyarugenge/);
  assert.match(experience, /Transaction types to track/);
  assert.match(experience, /Voluntary sale, succession, expropriation/);
  assert.match(experience, /not proof of price appreciation/);
  assert.match(experience, /TRANSACTION_DASHBOARD_SOURCE/);
  assert.match(experience, /annual district transaction totals for 2023/);
  assert.match(experience, /User-reported Bugesera month-to-date dashboard reading/);
  assert.match(experience, /4,031/);
  assert.match(experience, /reported-current-month-unverified/);
});


test("parcel asking price is parcel area multiplied by the available average transaction price per square metre", async () => {
  const experience = await readProjectFile("src/components/map/MapExperience.tsx");
  const pricing = await readProjectFile("src/lib/parcel-pricing.ts");
  assert.match(experience, /getUnitPriceEstimate\(landPriceRows, selectedArea, true\)/);
  assert.match(experience, /calculateParcelAskingPrice\(selectedArea\.parcelSizeM2, parcelUnitPriceEstimate\?\.pricePerM2\)/);
  assert.match(experience, /parcelPriceTypeLabel\("calculated-asking-price"\)/);
  assert.match(experience, /Asking price is calculated as parcel area × the available average transaction price per m²/);
  assert.match(pricing, /Math\.round\(parcelAreaM2 \* averageTransactionPricePerM2\)/);
  assert.equal(Math.round(546 * 49757), 27167322);
});

test("Show uses minimal on-off switches for all four place categories and zoning across the pilot", async () => {
  const experience = await readProjectFile("src/components/map/MapExperience.tsx");
  const mapView = await readProjectFile("src/components/map/MapView.tsx");
  const places = await readProjectFile("src/app/api/geography/places/route.ts");
  const zoning = await readProjectFile("src/app/api/geography/zoning/route.ts");

  for (const label of ["Landmarks", "Medical & schools", "Transportation", "Nature", "Zoning"]) {
    assert.match(experience, new RegExp(label.replace(/[.*+?^{}()|[\]\\]/g, "\\$&")));
  }
  assert.match(experience, /showScope="pilot"/);
  assert.match(experience, /show-toggle-track/);
  assert.match(mapView, /showZoning/);
  assert.match(mapView, /\/api\/geography\/zoning\?bbox=/);
  assert.match(places, /categories\.includes\("healthEducation"\) &&\s*\(/);
  assert.match(places, /overpassCache/);
  assert.match(zoning, /Proposed_Zoning_Plan|MapServer\/117/);
  assert.match(zoning, /Bugesera_DLUP/);
});

test("comparison searches every pilot administrative level and accepts any mixed comparison set", async () => {
  const experience = await readProjectFile("src/components/map/MapExperience.tsx");
  const search = await readProjectFile("src/app/api/geography/areas/search/route.ts");

  assert.match(search, /layers: \{ district: 4, sector: 5, cell: 6, village: 7 \}/);
  assert.match(search, /layers: \{ district: 2, sector: 4, cell: 3, village: 5 \}/);
  assert.match(search, /returnGeometry: "true"/);
  assert.match(search, /boundsFromGeometry/);
  assert.match(search, /centerFromBounds/);
  assert.match(experience, /setComparedAreas\(\(areas\) => \[\.\.\.areas, item\]\)/);
  assert.doesNotMatch(experience, /comparedAreas\.length >= 4/);
  assert.match(experience, /comparisonKind: "project"/);
  assert.match(experience, /No verified project data/);
  assert.match(experience, /placeholder="District, sector, cell, village, UPI or parcel number"/);
  assert.match(experience, /comparison-level-filter/);
  assert.match(experience, /visibleComparisonSearchResults/);
  assert.match(experience, /comparisonLevelFilter === "all" \|\| area\.level === comparisonLevelFilter/);
  assert.match(experience, /<option value="all">All levels<\/option>/);
  assert.match(experience, /All levels allows mixed comparisons/);
});

test("parcel location access covers main-road proximity, schools, hospitals, transport, landmarks and local offices", async () => {
  const route = await readProjectFile("src/app/api/geography/nearby-access/route.ts");
  const experience = await readProjectFile("src/components/map/MapExperience.tsx");
  const css = await readProjectFile("src/app/globals.css");

  assert.match(route, /type NearbyCategory = "Main road" \| "School" \| "Clinic \/ hospital" \| "Public transport" \| "Landmark" \| "Village office"/);
  assert.match(route, /type NearbyAmenityCategory = Exclude<NearbyCategory, "Main road">/);
  assert.match(route, /function buildRoadQuery/);
  assert.match(route, /trunk\|primary\|secondary\|tertiary/);
  assert.match(route, /function distanceToRoadSegmentKm/);
  assert.match(route, /routeStatus: "straight-line"/);
  assert.match(route, /Math\.round\(destination\.straightKm \* 100\) \/ 100/);
  assert.match(route, /amenity === "townhall"/);
  assert.match(route, /government === "administrative"/);
  assert.ok(route.includes('["lake", "peak", "waterfall", "spring"]'));
  assert.ok(route.includes('["attraction", "viewpoint", "museum", "zoo", "theme_park"]'));
  assert.match(route, /OpenStreetMap may have incomplete or outdated facility and landmark coverage/);
  assert.match(experience, /Checking road, school, hospital, transport and landmark access/);
  assert.match(experience, /straight-line to mapped road/);
  assert.match(experience, /straight-line · driving route unavailable/);
  assert.match(experience, /No mapped main roads, schools, hospitals, transport stops, landmarks or local offices found nearby/);
  assert.match(css, /\.comparison-search-filter-row/);
  assert.match(css, /\.comparison-level-filter:focus-visible/);
});

test("transaction indicators distinguish NISR 2023 baselines from the unverified Bugesera month-to-date observation", async () => {
  const data = await readProjectFile("src/data/transaction-benchmarks.ts");
  const route = await readProjectFile("src/app/api/geography/transaction-estimate/route.ts");
  const experience = await readProjectFile("src/components/map/MapExperience.tsx");

  for (const sourceValue of [
    "annualTransactions2023: 50698",
    "annualTransactions2023: 73377",
    "annualTransactions2023: 40102",
    "annualTransactions2023: 23527",
    "count: 4350",
    "user-reported-unverified"
  ]) assert.ok(data.includes(sourceValue), "missing benchmark datum: " + sourceValue);
  assert.match(route, /returnCountOnly: "true"/);
  assert.match(route, /districtBaseline/);
  assert.match(route, /estimatedShare: share/);
  assert.match(route, /Modelled estimate only, not an official monthly transaction count/);
  assert.match(experience, /Historical baseline: official 2023 annual district transactions ÷ 12/);
  assert.match(experience, /An indexed overview separately showed 4,031/);
});

test("selected-area KPIs have more width and responsive two-column spacing", async () => {
  const css = await readProjectFile("src/app/globals.css");
  const experience = await readProjectFile("src/components/map/MapExperience.tsx");
  assert.match(css, /width: min\(400px, calc\(100% - 36px\)\)/);
  assert.match(css, /\.area-market-grid\s*\{[^}]*align-items: stretch/s);
  assert.match(css, /\.parcel-estimate-card\s*\{/);
  assert.match(experience, /Transaction volume · monthly indicator/);
});


test("map hover and metric bubbles follow the selected indicator at each administrative level", async () => {
  const mapView = await readProjectFile("src/components/map/MapView.tsx");
  const experience = await readProjectFile("src/components/map/MapExperience.tsx");
  const metrics = await readProjectFile("src/app/api/geography/metric-bubbles/route.ts");

  assert.match(mapView, /feature-state.*hover/s);
  assert.match(mapView, /#65D5A1/);
  assert.match(mapView, /VILLAGE_ZOOM = 16\.2/);
  assert.match(mapView, /metric-bubbles-circle/);
  assert.match(mapView, /selectedMetricRef/);
  assert.match(experience, /selectedMetric=\{selectedMetric\}/);
  assert.match(metrics, /groupByFieldsForStatistics/);
  assert.match(metrics, /parcel-share-model/);
  assert.match(metrics, /not an official sector\/cell\/village transaction count/i);
});

test("comparison search includes cadastral UPI and parcel number", async () => {
  const search = await readProjectFile("src/app/api/geography/areas/search/route.ts");
  const experience = await readProjectFile("src/components/map/MapExperience.tsx");

  assert.match(search, /KIGALI_PARCELS/);
  assert.match(search, /BUGESERA_PARCELS/);
  assert.match(search, /async function searchParcels/);
  assert.match(search, /const upiField = chooseField\(fields, \["upi", "unique_parcel_identifier", "uniqueparcelidentifier"\]\)/);
  assert.match(search, /const parcelNumberField = chooseField\(fields, \["parcel_number", "parcelnumber", "parcel_no", "parcelno"\]\)/);
  assert.match(search, /outFields: Array.from\(new Set\(fieldsToReturn\)\)\.join\(","\) \|\| "\*"/);
  assert.match(experience, /UPI or parcel number/);
  assert.match(experience, /area\.upi/);
  assert.match(experience, /normalizeAreaName\(area\.parcelNumber\)/);
});

test("unavailable appreciation and supply metrics are not fabricated", async () => {
  const mapView = await readProjectFile("src/components/map/MapView.tsx");
  const experience = await readProjectFile("src/components/map/MapExperience.tsx");

  assert.match(mapView, /A dated historical and current comparable transaction-price series is not connected/);
  assert.match(mapView, /Registered parcel counts are not for-sale supply/);
  assert.match(experience, /Capital appreciation is calculated only when historical and current prices/);
});

test("map price tags use one compact uppercase formatter, preserve zoom hierarchy, and collapse collisions to dots", async () => {
  const formatter = await readProjectFile("src/lib/format-compact-value.ts");
  const mapView = await readProjectFile("src/components/map/MapView.tsx");
  const metricRoute = await readProjectFile("src/app/api/geography/metric-bubbles/route.ts");

  assert.match(formatter, /notation:\s*"compact"/);
  assert.match(formatter, /compactDisplay:\s*"short"/);
  assert.match(formatter, /suffix\.toUpperCase\(\)/);
  assert.match(formatter, /return "—"/);

  assert.match(mapView, /formatCompactValue\(sortValue\)/);
  assert.match(mapView, /ensureMetricPillImage/);
  assert.match(mapView, /"icon-image": \["get", "icon_image"\]/);
  assert.match(mapView, /"icon-allow-overlap": true/);
  assert.match(mapView, /"icon-ignore-placement": true/);
  assert.match(mapView, /findCrowdedMetricLabelIndexes\(collisionBoxes\)/);
  assert.match(mapView, /minimumCrowdedGroupSize = 3/);
  assert.match(mapView, /if \(component\.length >= minimumCrowdedGroupSize\)/);
  assert.match(mapView, /\["get", "show_dot"\], true/);
  assert.match(mapView, /\["!=", \["get", "show_dot"\], true\]/);
  assert.match(mapView, /const fillColor = isSelected/);
  assert.match(mapView, /id: "metric-bubbles-circle"/);
  assert.match(mapView, /"circle-radius": \[\s*"case",\s*\["==", \["get", "show_dot"\], true\],\s*2\.35,\s*3\.2\s*\]/);
  assert.doesNotMatch(mapView, /"circle-radius": \[\s*"case"[\s\S]{0,200}\["interpolate", \["linear"\], \["zoom"\]/);
  assert.match(mapView, /"fill-opacity": level === "parcel"\s*\?\s*\[/);
  assert.match(mapView, /level === "parcel"\s*\?\s*"#FFFFFF"/);
  assert.match(mapView, /"line-width": \[\s*"case",\s*\["boolean", \["feature-state", "selected"\], false\]/);
  assert.match(mapView, /level === "parcel" \? 1\.25 : level === "village" \? 1\.35 : 1\.05/);
  assert.match(mapView, /"line-opacity": level === "parcel" \? 0\.98 : 0\.94/);
  assert.match(mapView, /"icon-size": \["interpolate", \["linear"\], \["zoom"\], PARCEL_ZOOM, 1, 19, 1, 21, 1\.02\]/);
  assert.match(mapView, /map\.on\("click", "metric-bubbles-parcel-label", selectParcelFromMarker\)/);
  assert.match(mapView, /const requestedLevels: AreaLevel\[\] = AREA_LEVELS\.slice\(0, activeIndex \+ 1\)/);
  assert.match(mapView, /if \(activeLevel === "village"\) requestedLevels\.push\("parcel"\)/);
  assert.match(mapView, /status = "calculated-asking-price"/);
  assert.match(mapView, /properties\.parcel_size_m2/);
  assert.match(mapView, /selectedMetricRef\.current === "averageLandPricePerM2"/);
  assert.match(metricRoute, /formatCompactValue\(value\)/);
});

test("parcel price labels distinguish estimates from source-backed asking prices, recorded sales, and valuations", async () => {
  const mapView = await readProjectFile("src/components/map/MapView.tsx");
  const experience = await readProjectFile("src/components/map/MapExperience.tsx");
  const areaRoute = await readProjectFile("src/app/api/geography/areas/route.ts");

  for (const kind of [
    "calculated-asking-price",
    "indicative-estimate",
    "confirmed-asking-price",
    "recorded-sale-price",
    "formal-valuation"
  ]) {
    assert.ok(mapView.includes(kind), "missing parcel price type: " + kind);
  }

  assert.match(mapView, /parcel_price_type\?: ParcelPriceType \| null/);
  assert.match(mapView, /parcel_price_value\?: number \| null/);
  assert.match(mapView, /parcel_price_source\?: string \| null/);
  assert.match(mapView, /directParcelPriceIsSourced/);
  assert.match(mapView, /properties\.parcel_price_source\.trim\(\)\.length > 0/);
  assert.match(mapView, /status = properties\.parcel_price_type as ParcelPriceType/);

  assert.match(experience, /displayedParcelPriceTypeLabel/);
  assert.match(experience, /Source: \{selectedArea\.parcelPriceSource\}/);
  assert.match(experience, /Asking price is calculated as parcel area × the available average transaction price per m²/);
  assert.match(areaRoute, /upi,province,district,sector,cell,village,parcel_number,size,area_in_wetland,last_updated_on/);
  assert.doesNotMatch(areaRoute, /asking_price|recorded_sale_price|formal_valuation/i);
});

test("parcel price estimates exhaust existing price snapshots and use mapped geometry area before showing a unit-price fallback", async () => {
  const mapView = await readProjectFile("src/components/map/MapView.tsx");
  const experience = await readProjectFile("src/components/map/MapExperience.tsx");

  assert.match(mapView, /function geometryAreaM2\(geometry: Geometry\)/);
  assert.match(mapView, /geometryAreaM2\(feature\.geometry as Geometry\)/);
  assert.match(mapView, /parcelSizeSource/);
  assert.match(mapView, /priceByCell/);
  assert.match(mapView, /priceBySector/);
  assert.match(mapView, /priceByDistrict/);
  assert.match(mapView, /matching cell-level transaction-price snapshot/);
  assert.match(mapView, /derived sector mean of available cell snapshots/);
  assert.match(mapView, /district average transaction-price snapshot/);
  assert.match(mapView, /status = "asking-price-unit-rate"/);
  assert.match(mapView, /The parcel total uses parcel area × this rate when the parcel area is available/);

  assert.match(experience, /allowDistrictFallback && area\.level === "parcel" && area\.sector/);
  assert.match(experience, /Approx\. area from mapped boundary/);
  assert.match(experience, /Average transaction price \/ m²/);
  assert.match(experience, /uses the currently connected district transaction-price snapshot where finer-level data is missing/i);
});

test("price bubbles retain collision behavior and style property markers by market status and selection", async () => {
  const mapView = await readProjectFile("src/components/map/MapView.tsx");

  assert.match(mapView, /function measureMetricPill/);
  assert.match(mapView, /const fillColor = isSelected\s*\?\s*\["#2563EB", "#1D4ED8"\]/);
  assert.match(mapView, /marketStatus === "off-market"\s*\?\s*\["#3A3A42", "#2E2E35"\]/);
  assert.match(mapView, /marketStatus === "available"/);
  assert.match(mapView, /variant === "parcel"\s*\?\s*\["#8B9690", "#748079"\]/);
  assert.doesNotMatch(mapView.slice(mapView.indexOf("function ensureMetricPillImage"), mapView.indexOf("type MetricLabelCollisionBox")), /strokeStyle|context\.stroke\(\)/);
  assert.match(mapView, /export function findCrowdedMetricLabelIndexes/);
  assert.match(mapView, /minimumCrowdedGroupSize = 3/);
  assert.match(mapView, /component\.length >= minimumCrowdedGroupSize/);
  assert.match(mapView, /const pillScale = metricPillScaleAtZoom\(map\.getZoom\(\)\)/);
  assert.match(mapView, /const screenPoint = map\.project\(coordinates\)/);
  assert.match(mapView, /show_dot: crowdedLabelIndexes\.has\(featureIndex\)/);
  assert.match(mapView, /map\.on\("zoomend", scheduleRefresh\)/);
  assert.match(mapView, /map\.on\("moveend", scheduleRefresh\)/);
});

test("parcel price markers match the compact reference and combine NEW with price", async () => {
  const mapView = await readProjectFile("src/components/map/MapView.tsx");
  const experience = await readProjectFile("src/components/map/MapExperience.tsx");

  assert.ok(mapView.includes('type PropertyMarketStatus = "available" | "off-market"'));
  assert.ok(mapView.includes("listing_created_at?: string | number | null"));
  assert.ok(mapView.includes("const RECENT_LISTING_WINDOW_MS = 14 * 24 * 60 * 60 * 1000"));
  assert.ok(mapView.includes("function isRecentlyListed(value: unknown"));
  assert.ok(mapView.includes("isNewListing = false"));
  assert.ok(mapView.includes("const bodyHeight = isParcel ? (isNewListing ? 27 : 20) : 22;"));
  assert.ok(mapView.includes("const tailHeight = isParcel ? 5 : 0;"));
  assert.ok(mapView.includes("const width = isParcel ? 39 : Math.max(34, measuredWidth);"));
  assert.ok(mapView.includes('context.fillText("New", width / 2, 7.5, width - 4);'));
  assert.ok(mapView.includes("context.fillText(label, width / 2, 19, width - 4);"));
  assert.ok(mapView.includes('id: "metric-bubbles-parcel-label"'));
  assert.doesNotMatch(mapView, /metric-bubbles-new-badge|metric-new-listing-badge|icon-offset/);
  assert.ok(mapView.includes("is_new_listing: isNewListing"));
  assert.match(mapView, /const isNewListing = hasVerifiedListingDate && sourceMarketStatus === "available"/);
  assert.doesNotMatch(mapView, /demoParcelIsNewListing|demoParcelMarketStatus|isNewListingDemo/);
  assert.ok(mapView.includes('map.on("click", "metric-bubbles-parcel-label", selectParcelFromMarker)'));
  assert.ok(mapView.includes("String(selectedFeature.id) === String(id)"));
  assert.ok(experience.includes("Availability unverified"));
  assert.ok(mapView.includes("refreshMetricBubblesRef.current?.()"));
  assert.ok(mapView.includes("selectFeatureState(null)"));
  assert.ok(mapView.includes("onAreaSelected(null)"));
});

test("parcel availability is never invented when no verified listing source is connected", async () => {
  const mapView = await readProjectFile("src/components/map/MapView.tsx");
  const experience = await readProjectFile("src/components/map/MapExperience.tsx");
  const css = await readProjectFile("src/app/globals.css");

  assert.doesNotMatch(mapView, /demoParcelMarketStatus|demoParcelIsNewListing|isNewListingDemo|parcelIsNewListingDemo|is_new_listing_demo/);
  assert.match(mapView, /const marketStatus = level === "parcel" \? sourceMarketStatus : null/);
  assert.match(mapView, /const parcelMarketStatus = level === "parcel" \? suppliedMarketStatus : null/);
  assert.match(mapView, /const marketStatusSource = sourceMarketStatus \? "source" as const : null/);
  assert.match(mapView, /Verified current listings available to transact are not connected/);
  assert.match(experience, /Availability unverified/);
  assert.match(experience, /For-sale status unverified/);
  assert.match(css, /\.parcel-market-status-inline-unverified/);
  assert.match(css, /\.parcel-market-status-inline-off-market/);
});

test("parcel outlines keep a high-contrast casing above road and zoning overlays", async () => {
  const mapView = await readProjectFile("src/components/map/MapView.tsx");

  assert.match(mapView, /const PARCEL_OUTLINE_CASING_LAYER = "parcel-outline-casing"/);
  assert.match(mapView, /"line-color": \[/);
  assert.match(mapView, /"#1C2935"/);
  assert.match(mapView, /"line-width": \[/);
  assert.match(mapView, /VILLAGE_ZOOM, 1\.8/);
  assert.match(mapView, /PARCEL_ZOOM \+ 3\.85, 3\.2/);
  assert.match(mapView, /"fill-opacity": level === "parcel"\s*\?\s*\[/);
  assert.doesNotMatch(mapView, /"line-width": \[\s*"case"[\s\S]{0,500}\["interpolate", \["linear"\], \["zoom"\]/);
  assert.match(mapView, /const keepParcelBoundariesAndMarkersAboveContext = \(\) =>/);
  assert.match(mapView, /map\.moveLayer\(layerId\)/);
  assert.match(mapView, /keepParcelBoundariesAndMarkersAboveContext\(\);/);
});

test("parcel detail zoning uses exact cadastral geometry and reports mapped classifications", async () => {
  const route = await readProjectFile("src/app/api/geography/parcel-zoning/route.ts");
  const mapView = await readProjectFile("src/components/map/MapView.tsx");
  const experience = await readProjectFile("src/components/map/MapExperience.tsx");

  assert.match(route, /Kigali_Parcels_1June2026_for_search\/FeatureServer\/0/);
  assert.match(route, /Masterplan2020_22Apr2026\/MapServer\/117/);
  assert.match(route, /Bugesera_Parcels\/FeatureServer\/0/);
  assert.match(route, /Bugesera_DLUP\/FeatureServer\/0/);
  assert.match(route, /geometry: JSON\.stringify\(parcelGeometry\)/);
  assert.match(route, /geometryType: "esriGeometryPolygon"/);
  assert.match(route, /spatialRel: "esriSpatialRelIntersects"/);
  assert.match(route, /status: zones\.length > 0 \? "found" : "not-covered"/);
  assert.match(mapView, /zoningStatus\?: ParcelZoningStatus/);
  assert.match(experience, /Zoning \/ planning designation/);
  assert.match(experience, /No zoning designation mapped for this parcel/);
  assert.match(experience, /parcel-zoning\?/);
});


test("parcel API fails fast on upstream gateway outages and bounds the browser probe", async () => {
  const route = await readProjectFile("src/app/api/geography/areas/route.ts");
  const e2e = await readProjectFile("scripts/e2e-map-parcels.mjs");

  assert.ok(route.includes("isTransientUpstreamFailure"));
  assert.ok(route.includes("ArcGIS layer request failed \\((?:502|503|504)\\)"));
  assert.match(route, /isTransientUpstreamFailure \|\| depth >= 2/);
  assert.ok(route.includes("Promise.race([fetchPromise, timeoutPromise])"));
  assert.match(route, /ArcGIS layer request timed out after/);
  assert.ok(route.includes("Promise.race([fallbackPromise, timeoutPromise])"));
  assert.ok(route.includes("15_000"));
  assert.match(route, /same viewport is a stable GIS/);
  assert.doesNotMatch(route, /headers: \{ Accept: "application\/json" \},\s*cache: "no-store"/);
  assert.match(route, /vercel-empty-feature-collection/);
  assert.match(route, /const fastFallback = allowVercelFallback/);
  assert.match(route, /if \(fastFallback\?\.response\) return fastFallback\.response/);
  assert.ok(route.indexOf("const fastFallback = allowVercelFallback") < route.indexOf("const parcelBudget ="));
  assert.match(route, /"X-Parcel-Provider-Warning"/);
  assert.ok(route.includes("15_000"));
  assert.match(route, /requestHost\.endsWith\("\.workers\.dev"\)/);
  assert.match(route, /process\.env\.DEPLOYMENT_PLATFORM === "cloudflare-workers"/);
  assert.ok(route.includes("https://rwanda-land-intelligence.vercel.app"));
  assert.match(route, /if \(fallback\.response\) return fallback\.response/);
  assert.match(route, /"X-Parcel-Fallback-Source"/);
  assert.match(route, /"X-Parcel-Fallback-Status"/);
  assert.match(route, /"X-Parcel-Fallback-Reason"/);
  assert.match(route, /fallbackStatus: fallback\.status/);
  assert.match(route, /source_type !== "cadastral-parcel"/);
  assert.ok(e2e.includes("AbortSignal.timeout(25_000)"));
  assert.ok(e2e.includes('querySourceFeatures("land-parcels")'));
  assert.ok(e2e.includes("avoiding a duplicate GIS request"));
  assert.ok(e2e.includes("fallbackReason: body?.fallbackReason"));
  assert.ok(e2e.includes('responseHeaders["x-parcel-fallback-status"]'));
});

test("the geography API uses build-time transaction rows, not request-time filesystem reads", async () => {
  const route = await readProjectFile("src/app/api/geography/areas/route.ts");
  const generated = await readProjectFile("src/data/land-price-transaction.generated.ts");
  const generator = await readProjectFile("scripts/generate-land-price-index.mjs");

  assert.doesNotMatch(route, /node:fs\/promises/);
  assert.doesNotMatch(route, /readFile\(join\(process\.cwd\(\), "public"/);
  assert.match(route, /LAND_PRICE_TRANSACTION_ROWS/);
  assert.match(generated, /LAND_PRICE_TRANSACTION_ROWS/);
  assert.match(generator, /public.*land-price-transaction\.tsv/);
  assert.match(generator, /Generated/);
});

test("optional parcel casing is added only after required outline layers", async () => {
  const mapView = await readProjectFile("src/components/map/MapView.tsx");
  const outlineLoop = mapView.indexOf("if (map.getLayer(layer.outline)) continue;");
  const casingAttempt = mapView.indexOf("Optional parcel outline casing unavailable; primary parcel outlines remain active.");

  assert.ok(outlineLoop >= 0, "primary administrative and parcel outlines must be created");
  assert.ok(casingAttempt > outlineLoop, "optional casing is initialized after the primary outline loop");
  assert.match(mapView, /if \(!map\.getLayer\(PARCEL_OUTLINE_CASING_LAYER\) && map\.getLayer\(AREA_LAYERS\.parcel\.outline\)\)/);
});

test("global search returns navigable areas, resolves addresses on submit and highlights selected parcels cyan", async () => {
  const search = await readProjectFile("src/app/api/geography/areas/search/route.ts");
  const experience = await readProjectFile("src/components/map/MapExperience.tsx");
  const mapView = await readProjectFile("src/components/map/MapView.tsx");
  const css = await readProjectFile("src/app/globals.css");

  assert.ok(search.includes("addressOnly"));
  assert.ok(search.includes("OpenStreetMap Nominatim geocoding"));
  assert.ok(search.includes("PILOT_DISTRICTS.has(normalizeKey(district))"));
  assert.ok(search.includes("boundsFromGeometry"));
  assert.ok(search.includes("centerFromBounds"));
  assert.ok(search.includes('returnGeometry: "true"'));
  assert.ok(experience.includes("global-area-search-input"));
  assert.ok(experience.includes("/api/geography/areas/search?q="));
  assert.ok(experience.includes("/api/geography/areas/search?addressOnly=1"));
  assert.ok(experience.includes("mapInstance.fitBounds"));
  assert.ok(experience.includes("mapInstance.flyTo"));
  assert.ok(experience.includes("selectedArea={selectedArea}"));
  assert.ok(!experience.includes('href="/contact"'));
  assert.ok(mapView.includes('"#00E5FF"'));
  assert.ok(mapView.includes('"#67E8F9"'));
  assert.ok(mapView.includes("selectionSyncRef.current?.(selectedAreaRef.current)"));
  assert.ok(css.includes(".global-area-search-field"));
  assert.ok(css.includes(".global-area-search-results"));
});


test("projects can group multiple UPIs while preserving unverified links and per-parcel zoning", async () => {
  const experience = await readProjectFile("src/components/map/MapExperience.tsx");
  const css = await readProjectFile("src/app/globals.css");

  assert.match(experience, /type ProjectParcelRecord =/);
  assert.match(experience, /projectParcelUpis\?: string\[\]/);
  assert.match(experience, /projectParcelLinkStatus\?: "user-supplied-unverified" \| "source-verified"/);
  assert.match(experience, /function parseProjectUpis/);
  assert.match(experience, /\^\\d\{1,2\}\(\?:\[\/.\\-\]\\d\{1,2\}\)\{3\}/);
  assert.match(experience, /upis\.length > 20/);
  assert.match(experience, /resolveProjectParcel/);
  assert.match(experience, /\/api\/geography\/areas\/search\?q=/);
  assert.match(experience, /\/api\/geography\/parcel-zoning\?/);
  assert.match(experience, /projectParcelRecords/);
  assert.match(experience, /Project-to-parcel link: user supplied · unverified/);
  assert.match(experience, /Project parcel UPIs \/ zoning/);
  assert.match(experience, /PROJECT_NAME_SUGGESTIONS/);
  assert.match(experience, /"Gisa"/);
  assert.match(experience, /"Kigali Heights"/);
  assert.match(css, /\.comparison-project-upis/);
  assert.match(css, /\.project-parcel-link-item/);
  assert.match(css, /\.project-parcel-zones/);
});
