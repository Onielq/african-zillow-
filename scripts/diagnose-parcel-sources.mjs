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
    id: "bugesera-geodata-lais",
    label: "Bugesera LAIS parcels exposed by the supplied GeoData viewer",
    url: "https://geodata.rw/server/rest/services/LAISData/Bugesera_Parcels/FeatureServer/0"
  },
  {
    id: "bugesera-lais",
    label: "Bugesera LAIS parcels (services7 copy currently configured)",
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
    const availableFields = (metadata.fields ?? []).map((field) => field.name).filter(Boolean);
    const preferredFields = [
      "upi", "objectid", "objectid_1", "parcel_number", "parcelnumber",
      "district", "district_name", "sector", "sector_name", "cell",
      "cell_name", "village", "village_name", "size", "area"
    ];
    const outFields = preferredFields.filter((candidate) =>
      availableFields.some((field) => field.toLowerCase() === candidate.toLowerCase())
    ).join(",") || (metadata.objectIdField ?? metadata.objectIdFieldName ?? "*");
    const upiField = availableFields.find((field) => field.toLowerCase() === "upi");
    const where = upiField ? upiField + " IS NOT NULL" : "1=1";
    const sampleParams = new URLSearchParams({
      where,
      outFields,
      returnGeometry: "true",
      outSR: "4326",
      resultRecordCount: "2",
      f: "json"
    });
    const bboxParams = new URLSearchParams({
      where,
      geometry: bbox.join(","),
      geometryType: "esriGeometryEnvelope",
      inSR: "4326",
      outSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields,
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

async function inspectGeoDataViewerAndParTes() {
  const itemId = "7ca1b5f6bde6461abb269de05f167f4f";
  const itemRoots = [
    "https://geodata.rw/portal/sharing/rest/content/items/" + itemId,
    "https://www.arcgis.com/sharing/rest/content/items/" + itemId
  ];
  const viewerItems = await Promise.all(itemRoots.map(async (root) => {
    try {
      const [metadataResponse, dataResponse] = await Promise.all([
        readJson(root + "?f=json"),
        readJson(root + "/data?f=json")
      ]);
      const metadata = metadataResponse.data ?? {};
      const appData = dataResponse.data ?? null;
      const operationalLayers = [];
      const webMapIds = new Set();
      const serviceUrls = new Set();
      const visited = new Set();
      const walk = (value, depth = 0) => {
        if (!value || typeof value !== "object" || depth > 12 || visited.has(value)) return;
        visited.add(value);
        if (Array.isArray(value)) {
          for (const item of value) walk(item, depth + 1);
          return;
        }
        const record = value;
        const title = typeof record.title === "string" ? record.title : null;
        const url = typeof record.url === "string" ? record.url : null;
        const layerType = typeof record.layerType === "string" ? record.layerType : null;
        const itemIdValue = typeof record.itemId === "string" ? record.itemId : null;
        if (itemIdValue && /^[a-f0-9]{32}$/i.test(itemIdValue)) webMapIds.add(itemIdValue);
        if (url && /FeatureServer|MapServer|ImageServer|VectorTileServer/i.test(url)) {
          serviceUrls.add(url);
          operationalLayers.push({ title, url, layerType, itemId: itemIdValue });
        }
        for (const [key, child] of Object.entries(record)) {
          if (/webmap|web.?map|mapitem/i.test(key) && typeof child === "string" && /^[a-f0-9]{32}$/i.test(child)) {
            webMapIds.add(child);
          } else {
            walk(child, depth + 1);
          }
        }
      };
      walk(appData);
      return {
        root,
        metadata: {
          httpStatus: metadataResponse.httpStatus,
          title: metadata.title ?? null,
          type: metadata.type ?? null,
          typeKeywords: metadata.typeKeywords ?? [],
          url: metadata.url ?? null,
          error: metadata.error ?? null
        },
        appData: {
          httpStatus: dataResponse.httpStatus,
          parseError: Boolean(dataResponse.parseError),
          error: dataResponse.data?.error ?? null,
          webMapIds: [...webMapIds],
          serviceUrls: [...serviceUrls],
          operationalLayers: operationalLayers.slice(0, 100)
        }
      };
    } catch (error) {
      return { root, error: error instanceof Error ? error.message : String(error) };
    }
  }));

  const layerUrl = "https://geodata.rw/server/rest/services/ParTes/Buges_Par_Test/FeatureServer/0";
  let parTes;
  try {
    const metadataResponse = await readJson(layerUrl + "?f=json");
    const metadata = metadataResponse.data ?? {};
    const fieldNames = (metadata.fields ?? []).map((field) => field.name).filter(Boolean);
    const safeFieldNames = fieldNames.filter((name) =>
      /^(objectid|fid|id|upi|parcel.?number|district|sector|cell|village|size|area|land.?use|zoning|zone.?code|status|last.?updated)/i.test(name) &&
      !/owner|proprietor|person|identity|phone|email|address/i.test(name)
    );
    const upiField = fieldNames.find((name) => /^upi$/i.test(name));
    const objectIdField = metadata.objectIdField ?? metadata.objectIdFieldName ??
      fieldNames.find((name) => /^objectid$/i.test(name)) ?? null;
    const where = upiField ? upiField + " IS NOT NULL" : objectIdField ? objectIdField + " IS NOT NULL" : "1=1";
    const sampleParams = new URLSearchParams({
      where,
      outFields: safeFieldNames.length ? safeFieldNames.join(",") : "*",
      returnGeometry: "true",
      outSR: "4326",
      resultRecordCount: "2",
      f: "json"
    });
    const viewportParams = new URLSearchParams({
      where,
      geometry: BUGESERA_BBOX.join(","),
      geometryType: "esriGeometryEnvelope",
      inSR: "4326",
      outSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: safeFieldNames.length ? safeFieldNames.join(",") : "*",
      returnGeometry: "true",
      resultRecordCount: "2",
      f: "json"
    });
    const [sampleResponse, viewportResponse] = await Promise.all([
      readJson(layerUrl + "/query?" + sampleParams),
      readJson(layerUrl + "/query?" + viewportParams)
    ]);
    const sample = sampleResponse.data ?? {};
    const viewport = viewportResponse.data ?? {};
    const feature = sample.features?.[0] ?? viewport.features?.[0] ?? null;
    const geometry = feature?.geometry ?? null;
    parTes = {
      url: layerUrl,
      metadata: {
        httpStatus: metadataResponse.httpStatus,
        name: metadata.name ?? null,
        geometryType: metadata.geometryType ?? null,
        objectIdField,
        maxRecordCount: metadata.maxRecordCount ?? null,
        extent: metadata.extent ?? null,
        spatialReference: metadata.spatialReference ?? null,
        fields: fieldNames,
        hasUpi: Boolean(upiField)
      },
      sampleQuery: {
        httpStatus: sampleResponse.httpStatus,
        elapsedMs: sampleResponse.elapsedMs ?? null,
        error: sample.error ?? sampleResponse.sample ?? null,
        returnedFeatures: sample.features?.length ?? null,
        spatialReference: sample.spatialReference ?? geometry?.spatialReference ?? null,
        firstAttributes: feature?.attributes ?? null,
        geometryType: metadata.geometryType ?? null,
        firstCoordinate: firstCoordinate(geometry),
        coordinateAssessment: coordinateAssessment(firstCoordinate(geometry))
      },
      bugeseraViewportQuery: {
        bbox: BUGESERA_BBOX,
        httpStatus: viewportResponse.httpStatus,
        elapsedMs: viewportResponse.elapsedMs ?? null,
        error: viewport.error ?? viewportResponse.sample ?? null,
        returnedFeatures: viewport.features?.length ?? null,
        firstCoordinate: firstCoordinate(viewport.features?.[0]?.geometry)
      }
    };
  } catch (error) {
    parTes = { url: layerUrl, error: error instanceof Error ? error.message : String(error) };
  }
  return { viewerItems, parTes };
}

async function inspectBugeseraAdministrativeHierarchy() {
  const layers = [
    {
      id: "bugesera-cell-layer",
      level: "cell",
      url: "https://geodata.rw/server/rest/services/Overlays/Bugesera_Masterplan/MapServer/3",
      searchTerms: ["KINDAMA"]
    },
    {
      id: "bugesera-village-layer",
      level: "village",
      url: "https://geodata.rw/server/rest/services/Overlays/Bugesera_Masterplan/MapServer/5",
      searchTerms: ["REBERO"]
    }
  ];
  return Promise.all(layers.map(async (layer) => {
    try {
      const metadataResponse = await readJson(layer.url + "?f=json");
      const metadata = metadataResponse.data ?? {};
      const fields = metadata.fields ?? [];
      const nameCandidates = layer.level === "cell"
        ? ["cell", "cell_name", "cell_1", "cellule_1", "name", "name_e"]
        : ["village", "village_name", "village_1", "name", "name_e"];
      const nameField = fields.find((field) =>
        nameCandidates.some((candidate) =>
          candidate.toLowerCase().replace(/[^a-z0-9]/g, "") === String(field.name).toLowerCase().replace(/[^a-z0-9]/g, "")
        ) && String(field.type ?? "").toLowerCase().includes("string")
      )?.name ?? null;
      const queryResults = [];
      for (const term of layer.searchTerms) {
        if (!nameField) {
          queryResults.push({ term, error: "No matching string name field found." });
          continue;
        }
        const params = new URLSearchParams({
          where: "UPPER(" + nameField + ") = '" + term.replace(/'/g, "''") + "' OR UPPER(" + nameField + ") LIKE '" + term.replace(/'/g, "''") + "%'",
          outFields: "*",
          returnGeometry: "false",
          resultRecordCount: "8",
          f: "json"
        });
        const response = await readJson(layer.url + "/query?" + params);
        queryResults.push({
          term,
          httpStatus: response.httpStatus,
          error: response.data?.error ?? response.sample ?? null,
          returnedFeatures: response.data?.features?.length ?? null,
          records: (response.data?.features ?? []).slice(0, 8).map((feature) => feature.attributes ?? {})
        });
      }
      return {
        id: layer.id,
        url: layer.url,
        metadataHttpStatus: metadataResponse.httpStatus,
        layerName: metadata.name ?? null,
        geometryType: metadata.geometryType ?? null,
        objectIdField: metadata.objectIdField ?? null,
        fields: fields.map((field) => ({ name: field.name, type: field.type, alias: field.alias })),
        queryResults
      };
    } catch (error) {
      return { id: layer.id, url: layer.url, error: error instanceof Error ? error.message : String(error) };
    }
  }));
}

const results = await Promise.all(SOURCES.map(inspectSource));
const bugeseraViewportLoadTest = await inspectBugeseraViewportLoads();
const geoDataViewerInvestigation = await inspectGeoDataViewerAndParTes();
const bugeseraAdministrativeHierarchy = await inspectBugeseraAdministrativeHierarchy();
console.log(JSON.stringify({
  checkedAt: new Date().toISOString(),
  results,
  bugeseraViewportLoadTest,
  geoDataViewerInvestigation,
  bugeseraAdministrativeHierarchy
}, null, 2));
if (results.every((result) => !result.metadata && !result.error)) {
  process.exitCode = 1;
}
