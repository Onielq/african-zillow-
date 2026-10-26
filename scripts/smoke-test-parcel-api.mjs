#!/usr/bin/env node
/**
 * Runtime smoke test for the production Next.js parcel endpoint.
 * Requires the production server to be available at APP_BASE_URL.
 * No write requests or personal/owner fields are used.
 */
import { readFile } from "node:fs/promises";

const baseUrl = (process.env.APP_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const maplibrePackage = JSON.parse(
  await readFile(new URL("../node_modules/maplibre-gl/package.json", import.meta.url), "utf8")
);
const maplibreVersion = maplibrePackage.version;
const cases = [
  {
    source: "kigali",
    bbox: "29.996,-2.036,29.998,-2.034",
    label: "Small Kigali viewport around a known sample parcel"
  },
  {
    source: "bugesera",
    bbox: "30.131,-2.285,30.135,-2.281",
    label: "Small Bugesera viewport around a known sample parcel"
  }
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithRetry(url, attempts = 30) {
  let lastError = "not available";
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (response.ok || response.status >= 400) return response;
      lastError = "HTTP " + response.status;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(1000);
  }
  throw new Error("Production server did not become ready: " + lastError);
}

function firstCoordinate(geometry) {
  const visit = (value) => {
    if (!Array.isArray(value)) return null;
    if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
      return [value[0], value[1]];
    }
    for (const item of value) {
      const candidate = visit(item);
      if (candidate) return candidate;
    }
    return null;
  };
  return visit(geometry?.coordinates);
}

function geometryBounds(geometry) {
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  const visit = (value) => {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
      west = Math.min(west, value[0]);
      south = Math.min(south, value[1]);
      east = Math.max(east, value[0]);
      north = Math.max(north, value[1]);
      return;
    }
    for (const item of value) visit(item);
  };
  visit(geometry?.coordinates);
  return Number.isFinite(west) ? [west, south, east, north] : null;
}

function overlaps(a, b) {
  return a && a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

function validateWgs84(coord) {
  return Array.isArray(coord) &&
    Number.isFinite(coord[0]) && Number.isFinite(coord[1]) &&
    Math.abs(coord[0]) <= 180 && Math.abs(coord[1]) <= 90 &&
    coord[0] >= 28.5 && coord[0] <= 31.2 &&
    coord[1] >= -3.1 && coord[1] <= -0.8;
}

async function main() {
  const home = await fetchWithRetry(baseUrl + "/");
  if (!home.ok) throw new Error("Home page failed with HTTP " + home.status);

  // The browser must be able to load MapLibre's version-matched module worker
  // and the sibling shared module. This catches the past "Worker failed to
  // load" problem at the actual production server/static-asset layer.
  const mapWorkerAssets = [];
  for (const fileName of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
    const url = baseUrl + "/vendor/maplibre-gl/" + maplibreVersion + "/" + fileName;
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const body = await response.text();
    if (!response.ok || body.length < 1000) {
      throw new Error(
        "MapLibre worker asset failed: " + url + " returned HTTP " +
        response.status + " and " + body.length + " bytes."
      );
    }
    mapWorkerAssets.push({
      file: fileName,
      httpStatus: response.status,
      bytes: body.length,
      status: "served"
    });
  }

  const summaries = [];
  for (const item of cases) {
    const bbox = item.bbox.split(",").map(Number);
    const query = new URLSearchParams({
      level: "parcel",
      source: item.source,
      bbox: item.bbox
    });
    const response = await fetch(baseUrl + "/api/geography/areas?" + query);
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(
        item.source + " parcel API returned HTTP " + response.status +
        ": " + JSON.stringify(body).slice(0, 400)
      );
    }
    if (!body || body.type !== "FeatureCollection" || !Array.isArray(body.features)) {
      throw new Error(item.source + " parcel API did not return a GeoJSON FeatureCollection.");
    }

    const polygonFeatures = body.features.filter((feature) =>
      feature?.geometry && ["Polygon", "MultiPolygon"].includes(feature.geometry.type)
    );
    const coord = firstCoordinate(polygonFeatures[0]?.geometry);
    const intersectingFeatures = polygonFeatures.filter((feature) =>
      overlaps(geometryBounds(feature.geometry), bbox)
    ).length;
    const overlapRatio = polygonFeatures.length ? intersectingFeatures / polygonFeatures.length : 0;

    if (polygonFeatures.length === 0) {
      throw new Error(
        item.source + " parcel API returned zero polygon features for " + item.bbox +
        ". Check upstream filtering/coordinate transforms and source coverage."
      );
    }
    if (!validateWgs84(coord)) {
      throw new Error(
        item.source + " parcel API returned an invalid/non-Rwanda coordinate: " +
        JSON.stringify(coord)
      );
    }
    if (intersectingFeatures === 0 || overlapRatio < 0.8) {
      throw new Error(
        item.source + " parcel API appears to return features outside the requested viewport. " +
        "Viewport overlap: " + intersectingFeatures + "/" + polygonFeatures.length +
        " (bbox " + item.bbox + ")."
      );
    }

    summaries.push({
      source: item.source,
      label: item.label,
      httpStatus: response.status,
      featureCount: body.features.length,
      polygonCount: polygonFeatures.length,
      polygonsIntersectingViewport: intersectingFeatures,
      viewportOverlapRatio: Number(overlapRatio.toFixed(3)),
      firstCoordinate: coord,
      coordinateCheck: "valid WGS84 coordinate within Rwanda bounds",
      viewportFilterCheck: "passed",
      dataSourceHeader: response.headers.get("x-data-source"),
      providerWarning: response.headers.get("x-parcel-provider-warning") ?? null
    });
  }
  console.log(JSON.stringify({
    checkedAt: new Date().toISOString(),
    productionServer: baseUrl,
    homePageStatus: home.status,
    maplibreVersion,
    mapWorkerAssets,
    parcelApiChecks: summaries
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
