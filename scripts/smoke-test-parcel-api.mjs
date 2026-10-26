#!/usr/bin/env node
/**
 * Runtime smoke test for the production Next.js parcel endpoint.
 * Requires the production server to be available at APP_BASE_URL.
 * No write requests or personal/owner fields are used.
 */
const baseUrl = (process.env.APP_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const cases = [
  {
    source: "kigali",
    bbox: "29.95,-2.06,30.05,-2.00",
    label: "Kigali viewport around a known sample parcel"
  },
  {
    source: "bugesera",
    bbox: "30.10,-2.32,30.16,-2.25",
    label: "Bugesera viewport around a known sample parcel"
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
    if (
      value.length >= 2 &&
      typeof value[0] === "number" &&
      typeof value[1] === "number"
    ) return [value[0], value[1]];
    for (const item of value) {
      const candidate = visit(item);
      if (candidate) return candidate;
    }
    return null;
  };
  return visit(geometry?.coordinates);
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

  const summaries = [];
  for (const item of cases) {
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
      feature?.geometry &&
      ["Polygon", "MultiPolygon"].includes(feature.geometry.type)
    );
    const coord = firstCoordinate(polygonFeatures[0]?.geometry);
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
    summaries.push({
      source: item.source,
      label: item.label,
      httpStatus: response.status,
      featureCount: body.features.length,
      polygonCount: polygonFeatures.length,
      firstCoordinate: coord,
      coordinateCheck: "valid WGS84 coordinate within Rwanda bounds",
      dataSourceHeader: response.headers.get("x-data-source"),
      providerWarning: response.headers.get("x-parcel-provider-warning") ?? null
    });
  }
  console.log(JSON.stringify({
    checkedAt: new Date().toISOString(),
    productionServer: baseUrl,
    homePageStatus: home.status,
    parcelApiChecks: summaries
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
