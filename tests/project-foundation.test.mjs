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

test("the map view progressively switches from districts to sectors, cells, and villages", async () => {
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
  assert.match(mapView, /0\.2/);
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
