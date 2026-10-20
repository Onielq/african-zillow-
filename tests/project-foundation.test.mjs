import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const readProjectFile = (path) => readFile(join(root, path), "utf8");

test("the map view uses a real configured style and an honest default", async () => {
  const mapView = await readProjectFile("src/components/map/MapView.tsx");
  assert.match(mapView, /NEXT_PUBLIC_MAP_STYLE_URL/);
  assert.match(mapView, /tiles\.openfreemap\.org\/styles\/positron/);
  assert.match(mapView, /NavigationControl/);
  assert.match(mapView, /AttributionControl/);
});

test("the UI explicitly distinguishes the basemap from land records", async () => {
  const experience = await readProjectFile("src/components/map/MapExperience.tsx");
  assert.match(experience, /Parcel boundaries, official zoning, and listing counts are not connected yet/);
  assert.match(experience, /Kigali City/);
  assert.match(experience, /Bugesera/);
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
