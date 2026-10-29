#!/usr/bin/env node
/**
 * Read-only diagnostics for the public parcel GIS services.
 * This script deliberately reports metadata/sample coordinates only; it never
 * downloads the full parcel dataset, asks for owner data, or edits provider data.
 */
const SOURCES = [
  {
    id: "kigali-search",
    label: "Kigali public search parcels (currently configured)",
    url: "https://masterplan.kigalicity.gov.rw/server/rest/services/Hosted/Kigali_Parcels_1June2026_for_search/FeatureServer/0"
  },
  {
    id: "kigali-june-2026",
    label: "Kigali June 2026 parcels",
    url: "https://masterplan.kigalicity.gov.rw/server/rest/services/Hosted/KigaliParcelsJune2026/FeatureServer/0"
  },
  {
    id: "kigali-zoning-upi",
    label: "Kigali parcels with zoning and UPI",
    url: "https://masterplan.kigalicity.gov.rw/server/rest/services/Hosted/KigaliParcels_withZoning/FeatureServer/0"
  },
  {
    id: "bugesera-lais",
    label: "Bugesera LAIS parcels",
    url: "https://services7.arcgis.com/htgaiKX6RV2DDGgK/arcgis/rest/services/Bugesera_Parcels/FeatureServer/0"
  }
];

const REQUEST_TIMEOUT_MS = 12_000;
const REQUEST_HEADERS = { Accept: "application/json", "User-Agent": "RwandaLandIntelligenceMap/parcel-diagnostics" };
const KIGALI_BBOX = [29.85, -2.10, 30.28, -1.48];
const BUGESERA_BBOX = [29.82, -2.62, 30.56, -1.92];

async function readJson(url) {
  const startedAt = Date.now();
  const response = await fetch(url, {
    headers: REQUEST_HEADERS,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  const body = await response.text();
  const elapsedMs = Date.now() - startedAt;
  let data;
  try {
    data = JSON.parse(body);
  } catch {
    return { httpStatus: response.status, ok: response.ok, elapsedMs, bytes: body.length, parseError: true, sample: body.slice(0, 180) };
  }
  return { httpStatus: response.status, ok: response.ok, elapsedMs, bytes: body.length, data };
}

function firstCoordinate(geometry) {
  if (!geometry || typeof geometry !== "object") return null;
  const nested = geometry.rings ?? geometry.coordinates ?? geometry.paths;
  if (!Array.isArray(nested)) return null;
  let current = nested;
  while (Array.isArray(current) && current.length > 0) {
    if (typeof current[0] === "number" && typeof current[1] === "number") {
      return [current[0], current[1]];
    }
    current = current[0];
  }
  return null;
}

function coordinateAssessment(coord) {
  if (!coord) return "no polygon coordinate returned";
  const [x, y] = coord;
  if (Math.abs(x) <= 180 && Math.abs(y) <= 90) return "coordinate pair is within longitude/latitude ranges";
  return "coordinate pair is projected/unknown, not directly usable as GeoJSON longitude/latitude";
}

async function inspectSource(source) {
  const result = { id: source.id, label: source.label, url: source.url };
  try {
    const metaResponse = await readJson(source.url + "?f=json");
    if (!metaResponse.data) {
      return { ...result, metadataRequest: { httpStatus: metaResponse.httpStatus, error: metaResponse.sample ?? "Non-JSON response" } };
    }
    const metadata = metaResponse.data;
    result.metadata = {
      httpStatus: metaResponse.httpStatus,
      layerName: metadata.name ?? null,
      geometryType: metadata.geometryType ?? null,
      objectIdField: metadata.objectIdField ?? metadata.objectIdFieldName ?? null,
      maxRecordCount: metadata.maxRecordCount ?? null,
      spatialReference: metadata.spatialReference ?? null,
      extent: metadata.extent ?? null,
      fields: (metadata.fields ?? []).map((field) => field.name),
      metadataError: metadata.error ?? null
    };
    if (!metaResponse.ok || metadata.error) return result;

    const bbox = source.id.startsWith("bugesera") ? BUGESERA_BBOX : KIGALI_BBOX;
    const sampleParams = new URLSearchParams({
      where: "upi IS NOT NULL",
      outFields: "upi,objectid,parcel_number,district,sector,cell",
      returnGeometry: "true",
      outSR: "4326",
      resultRecordCount: "2",
      f: "json"
    });
    const bboxParams = new URLSearchParams({
      where: "upi IS NOT NULL",
      geometry: bbox.join(","),
      geometryType: "esriGeometryEnvelope",
      inSR: "4326",
      outSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "upi,objectid,parcel_number,district,sector,cell",
      returnGeometry: "true",
      resultRecordCount: "2",
      f: "json"
    });

    const [sampleResponse, bboxResponse] = await Promise.all([
      readJson(source.url + "/query?" + sampleParams),
      readJson(source.url + "/query?" + bboxParams)
    ]);
    const sampleData = sampleResponse.data ?? {};
    const bboxData = bboxResponse.data ?? {};
    const sampleFeature = sampleData.features?.[0] ?? null;
    const bboxFeature = bboxData.features?.[0] ?? null;
    const coord = firstCoordinate(sampleFeature?.geometry ?? bboxFeature?.geometry);
    result.queryTests = {
      sample: {
        httpStatus: sampleResponse.httpStatus,
        error: sampleData.error ?? null,
        returnedFeatures: sampleData.features?.length ?? null,
        spatialReference: sampleData.spatialReference ?? sampleFeature?.geometry?.spatialReference ?? null,
        firstAttributes: sampleFeature?.attributes ?? null,
        firstCoordinate: coord,
        coordinateAssessment: coordinateAssessment(coord)
      },
      KigaliOrBugeseraWgs84Viewport: {
        bbox,
        httpStatus: bboxResponse.httpStatus,
        error: bboxData.error ?? null,
        returnedFeatures: bboxData.features?.length ?? null,
        spatialReference: bboxData.spatialReference ?? bboxFeature?.geometry?.spatialReference ?? null,
        firstCoordinate: firstCoordinate(bboxFeature?.geometry)
      }
    };
    return result;
  } catch (error) {
    return { ...result, error: error instanceof Error ? error.message : String(error) };
  }
}

async function inspectBugeseraViewportLoads() {
  const sourceUrl = SOURCES.find((source) => source.id === "bugesera-lais").url;
  const bbox = [30.12, -2.30, 30.15, -2.26];
  const resultCounts = [25, 80, 300];
  const tests = [];

  // Use the same viewport and full geometry fields as the app. Run serially to
  // avoid hammering the public service while comparing the payload sizes.
  for (const resultRecordCount of resultCounts) {
    const params = new URLSearchParams({
      where: "upi IS NOT NULL",
      geometry: bbox.join(","),
      geometryType: "esriGeometryEnvelope",
      inSR: "4326",
      outSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "upi,province,district,sector,cell,village,parcel_number,size,area_in_wetland,last_updated_on",
      returnGeometry: "true",
      resultRecordCount: String(resultRecordCount),
      f: "json"
    });
    try {
      const response = await readJson(sourceUrl + "/query?" + params);
      const data = response.data ?? {};
      tests.push({
        resultRecordCount,
        httpStatus: response.httpStatus,
        elapsedMs: response.elapsedMs,
        bytes: response.bytes,
        returnedFeatures: data.features?.length ?? null,
        error: data.error ?? response.sample ?? null,
        firstFeatureHasGeometry: Boolean(data.features?.[0]?.geometry),
        firstFeatureUPI: data.features?.[0]?.attributes?.upi ?? null
      });
    } catch (error) {
      tests.push({
        resultRecordCount,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  return { bbox, tests };
}

const results = await Promise.all(SOURCES.map(inspectSource));
const bugeseraViewportLoadTest = await inspectBugeseraViewportLoads();
console.log(JSON.stringify({
  checkedAt: new Date().toISOString(),
  results,
  bugeseraViewportLoadTest
}, null, 2));
if (results.every((result) => !result.metadata && !result.error)) {
  process.exitCode = 1;
}
