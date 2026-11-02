#!/usr/bin/env node
/**
 * Read-only check for the example Kigali UPI in the configured and alternate
 * public parcel layers. It does not export the cadastral dataset or request owner data.
 */
const SAMPLE_UPI = "1/02/09/02/1446";
const SOURCES = [
  { id: "kigali-current-search", url: "https://masterplan.kigalicity.gov.rw/server/rest/services/Hosted/Kigali_Parcels_1June2026_for_search/FeatureServer/0" },
  { id: "kigali-june-2026", url: "https://masterplan.kigalicity.gov.rw/server/rest/services/Hosted/KigaliParcelsJune2026/FeatureServer/0" },
  { id: "kigali-with-zoning", url: "https://masterplan.kigalicity.gov.rw/server/rest/services/Hosted/KigaliParcels_withZoning/FeatureServer/0" }
];
const HEADERS = { Accept: "application/json", "User-Agent": "Taiseel-Kigali-UPI-diagnostic/1.0" };

async function requestJson(url) {
  const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(12000) });
  const raw = await response.text();
  let payload;
  try { payload = JSON.parse(raw); } catch { throw new Error("HTTP " + response.status + " returned non-JSON: " + raw.slice(0, 150)); }
  if (!response.ok || payload.error) throw new Error("HTTP " + response.status + ": " + (payload.error?.message ?? "request failed"));
  return payload;
}

function firstCoordinate(geometry) {
  let current = geometry?.rings ?? geometry?.coordinates;
  while (Array.isArray(current) && current.length) {
    if (typeof current[0] === "number" && typeof current[1] === "number") return [current[0], current[1]];
    current = current[0];
  }
  return null;
}

async function inspect(source) {
  try {
    const metadata = await requestJson(source.url + "?f=json");
    const fields = new Set((metadata.fields ?? []).map((field) => field.name?.toLowerCase()));
    if (!fields.has("upi")) return { source: source.id, status: "missing-upi-field", layerName: metadata.name ?? null };
    const query = new URLSearchParams({
      where: "upi = '1/02/09/02/1446'",
      outFields: "*",
      returnGeometry: "true",
      outSR: "4326",
      resultRecordCount: "1",
      f: "json"
    });
    const body = await requestJson(source.url + "/query?" + query.toString());
    const feature = body.features?.[0] ?? null;
    const attributes = feature?.attributes ?? {};
    return {
      source: source.id,
      layerName: metadata.name ?? null,
      maxRecordCount: metadata.maxRecordCount ?? null,
      status: feature ? "upi-found" : "upi-not-found",
      featureCount: body.features?.length ?? 0,
      upi: attributes.upi ?? null,
      district: attributes.district ?? null,
      sector: attributes.sector ?? null,
      cell: attributes.cell ?? null,
      village: attributes.village ?? null,
      parcelNumber: attributes.parcel_number ?? null,
      parcelSizeM2: attributes.size ?? null,
      geometryType: feature?.geometry?.rings ? "esriPolygon" : feature?.geometry?.type ?? null,
      firstCoordinate: firstCoordinate(feature?.geometry),
      spatialReference: feature?.geometry?.spatialReference ?? body.spatialReference ?? null
    };
  } catch (error) {
    return { source: source.id, status: "request-failed", reason: error instanceof Error ? error.message : String(error) };
  }
}

const results = await Promise.all(SOURCES.map(inspect));
console.log(JSON.stringify({
  checkedAt: new Date().toISOString(),
  sampleUPI: SAMPLE_UPI,
  note: "Absence in one layer does not prove the parcel is absent from the cadastral system. Compare the published layers and their administrative fields.",
  results
}, null, 2));
