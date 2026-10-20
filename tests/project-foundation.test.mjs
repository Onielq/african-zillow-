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
  assert.match(route, /FeatureServer/);
  assert.match(route, /district, sector, cell, or village/);
  assert.match(route, /layerIds = \{ district: 0, sector: 1, cell: 2, village: 3 \}/);
  assert.match(route, /geometryType/);
  assert.match(route, /arcGisPolygonToGeoJson/);
  assert.match(route, /f: "json"/);
});

test("the map view progressively switches administrative levels and increases boundary opacity", async () => {
  const mapView = await readProjectFile("src/components/map/MapView.tsx");
  assert.match(mapView, /SECTOR_ZOOM/);
  assert.match(mapView, /CELL_ZOOM/);
  assert.match(mapView, /VILLAGE_ZOOM/);
  assert.match(mapView, /district-fill/);
  assert.match(mapView, /sector-fill/);
  assert.match(mapView, /cell-fill/);
  assert.match(mapView, /village-fill/);
  assert.match(mapView, /fitBounds/);
  assert.match(mapView, /setFeatureState/);
  assert.match(mapView, /0\.35/);
  assert.match(mapView, /0\.5/);
  assert.match(mapView, /0\.62/);
});

test("the average land price metric uses sourced district values and marks snapshot freshness limitations", async () => {
  const route = await readProjectFile("src/app/api/geography/areas/route.ts");
  const mapView = await readProjectFile("src/components/map/MapView.tsx");
  const experience = await readProjectFile("src/components/map/MapExperience.tsx");

  assert.match(route, /DISTRICT_AVERAGE_LAND_PRICE_RWF_PER_M2/);
  assert.match(route, /GASABO: 36013/);
  assert.match(route, /KICUKIRO: 61491/);
  assert.match(route, /NYARUGENGE: 50735/);
  assert.match(route, /BUGESERA: 4033/);
  assert.match(route, /average_land_price_per_m2/);
  assert.match(route, /rwandalanddashboard\.lands\.rw\/prices/);
  assert.match(mapView, /showLandPriceHeatmap/);
  assert.match(mapView, /average_land_price_per_m2/);
  assert.match(experience, /source observation date not exposed/i);
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
  assert.match(mapView, /map\.setStyle\(basemapMode === "satellite"/);
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
  assert.match(experience, /no verified series is connected/i);
  assert.match(experience, /No project markers or prices are fabricated/);
});

test("area comparison supports up to four areas without fabricating unavailable metrics", async () => {
  const experience = await readProjectFile("src/components/map/MapExperience.tsx");
  const css = await readProjectFile("src/app/globals.css");

  assert.match(experience, /setComparedAreas/);
  assert.match(experience, /comparedAreas\.length >= 4/);
  assert.match(experience, /Add to comparison/);
  assert.match(experience, /Not connected/);
  assert.match(experience, /Clear shortlist/);
  assert.match(css, /\.comparison-panel/);
});

test("the source register separates connected boundaries from pending market feeds", async () => {
  const experience = await readProjectFile("src/components/map/MapExperience.tsx");
  assert.match(experience, /Market data sources/);
  assert.match(experience, /Administrative boundaries/);
  assert.match(experience, /Land transaction summaries/);
  assert.match(experience, /Rental yields and house-sale prices/);
  assert.match(experience, /Projects and upcoming supply/);
  assert.match(experience, /https:\/\/data\.gov\.rw\/datasets/);
});

test("the basemap has a documented fallback style", async () => {
  const mapView = await readProjectFile("src/components/map/MapView.tsx");
  assert.match(mapView, /styles\/liberty/);
  assert.match(mapView, /map\.setStyle\(FALLBACK_STYLE_URL\)/);
});

test("the UI distinguishes administrative boundaries from parcel and ownership data", async () => {
  const experience = await readProjectFile("src/components/map/MapExperience.tsx");
  assert.match(experience, /not a cadastral plot/);
  assert.match(experience, /Land records not connected yet/);
  assert.match(experience, /reuse terms must be confirmed before production/i);
});

test("hydration warning suppression is scoped to the body element", async () => {
  const layout = await readProjectFile("src/app/layout.tsx");
  assert.match(layout, /<body suppressHydrationWarning>/);
});

test("the experience provides responsive focus controls and reduced-motion support", async () => {
  const experience = await readProjectFile("src/components/map/MapExperience.tsx");
  const css = await readProjectFile("src/app/globals.css");
  assert.match(experience, /prefers-reduced-motion/);
  assert.match(experience, /flyTo/);
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

  assert.equal(packageJson.scripts.postinstall, "node scripts/copy-maplibre-worker.mjs");
  assert.equal(packageJson.scripts.predev, "node scripts/copy-maplibre-worker.mjs");
  assert.equal(packageJson.scripts.prebuild, "node scripts/copy-maplibre-worker.mjs");
  assert.match(mapView, /setWorkerUrl/);
  assert.match(mapView, /vendor\/maplibre-gl/);
  assert.match(copyScript, /maplibre-gl-worker\.mjs/);
  assert.match(copyScript, /maplibre-gl-shared\.mjs/);
});
