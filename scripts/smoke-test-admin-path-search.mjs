#!/usr/bin/env node
/**
 * Live smoke tests for partial administrative paths in the global map search.
 * These tests use real map-source records and verify selected village geometry.
 */
const baseUrl = (process.env.APP_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const expected = {
  district: "Bugesera",
  sector: "Ruhuha",
  cell: "Kindama",
  village: "Rebero"
};
const cases = [
  { query: "Kindama, Rebero", label: "cell → village" },
  { query: "bugesera, ruhuha, kindama, rebero", label: "district → sector → cell → village" },
  { query: "ruhuha, kindama, rebero", label: "sector → cell → village" },
  { query: "bugesera, rebero", label: "district → village" }
];

function normalize(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
function matchesExpected(area) {
  return normalize(area.district) === normalize(expected.district) &&
    normalize(area.sector) === normalize(expected.sector) &&
    normalize(area.cell) === normalize(expected.cell) &&
    normalize(area.village ?? area.name) === normalize(expected.village);
}

async function search(query) {
  const url = baseUrl + "/api/geography/areas/search?q=" + encodeURIComponent(query);
  const response = await fetch(url, { signal: AbortSignal.timeout(25_000), cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error('"' + query + '" returned HTTP ' + response.status + ": " + JSON.stringify(payload));
  }
  const match = (payload.areas ?? []).find(matchesExpected);
  if (!match) {
    const sample = (payload.areas ?? []).slice(0, 12).map((area) => ({
      name: area.name,
      level: area.level,
      district: area.district,
      sector: area.sector,
      cell: area.cell,
      village: area.village,
      source: area.mapSourceId
    }));
    throw new Error('"' + query + '" did not resolve to Bugesera / Ruhuha / Kindama / Rebero. Results: ' + JSON.stringify(sample));
  }
  return match;
}

const results = [];
let firstMatch = null;
for (const testCase of cases) {
  const match = await search(testCase.query);
  if (!firstMatch) firstMatch = match;
  results.push({
    query: testCase.query,
    pattern: testCase.label,
    matched: [match.district, match.sector, match.cell, match.village].join(" / "),
    level: match.level,
    source: match.mapSourceId,
    sourceObjectId: match.sourceObjectId
  });
}

const params = new URLSearchParams({
  resolveGeometry: "1",
  source: firstMatch.mapSourceId,
  level: firstMatch.level,
  name: firstMatch.name,
  district: firstMatch.district
});
for (const key of ["sector", "cell", "village", "districtId", "sectorId", "cellId", "villageId"]) {
  const value = firstMatch[key];
  if (value) params.set(key, value);
}
const geometryResponse = await fetch(baseUrl + "/api/geography/areas/search?" + params.toString(), {
  signal: AbortSignal.timeout(20_000),
  cache: "no-store"
});
const geometry = await geometryResponse.json().catch(() => ({}));
if (!geometryResponse.ok || !Array.isArray(geometry.bounds) || geometry.bounds.length !== 4) {
  throw new Error("Selected village boundary did not resolve: HTTP " + geometryResponse.status + " " + JSON.stringify(geometry));
}
console.log(JSON.stringify({
  status: "passed",
  baseUrl,
  cases: results,
  selectedVillageBounds: geometry.bounds,
  selectedVillageCenter: geometry.center
}, null, 2));
