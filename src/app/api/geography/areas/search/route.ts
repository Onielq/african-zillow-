import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const revalidate = 300;

const KIGALI_MAP_SERVER =
  "https://masterplan.kigalicity.gov.rw/server/rest/services/Masterplan2020/Masterplan2020_22Apr2026/MapServer";
const BUGESERA_MAP_SERVER =
  "https://geodata.rw/server/rest/services/Overlays/Bugesera_Masterplan/MapServer";
const KIGALI_PARCELS =
  "https://masterplan.kigalicity.gov.rw/server/rest/services/Hosted/Kigali_Parcels_1June2026_for_search/FeatureServer/0";
const BUGESERA_PARCELS =
  "https://services7.arcgis.com/htgaiKX6RV2DDGgK/arcgis/rest/services/Bugesera_Parcels/FeatureServer/0";

type AdminAreaLevel = "district" | "sector" | "cell" | "village";
type AreaLevel = AdminAreaLevel | "parcel";
type SourceId = "kigali" | "bugesera";
type FieldMetadata = { name: string; alias?: string; type?: string };
type LayerMetadata = { fields?: FieldMetadata[]; error?: { message?: string } };
type LayerQueryResponse = {
  features?: Array<{ attributes?: Record<string, unknown>; geometry?: unknown }>;
  error?: { code?: number; message?: string };
  exceededTransferLimit?: boolean;
};

type SearchAddress = {
  id: string;
  kind: "address";
  name: string;
  displayName: string;
  latitude: number;
  longitude: number;
  sourceLabel: string;
};

type SearchArea = {
  id: string;
  level: AreaLevel;
  name: string;
  province: string;
  district: string;
  districtId: string | null;
  sector: string | null;
  sectorId: string | null;
  cell: string | null;
  cellId: string | null;
  village: string | null;
  villageId: string | null;
  averageLandPricePerM2: number | null;
  sourceLabel: string;
  sourceType: "administrative-boundary" | "cadastral-parcel";
  mapSourceId?: SourceId;
  sourceObjectId?: string | null;
  upi?: string | null;
  parcelNumber?: string | null;
  parcelSizeM2?: number | null;
  lastUpdatedOn?: number | null;
  bounds?: [number, number, number, number] | null;
  center?: [number, number] | null;
};

const PILOT_DISTRICTS = new Set(["gasabo", "kicukiro", "nyarugenge", "bugesera"]);
const SOURCE_DISTRICTS: Record<SourceId, string[]> = {
  kigali: ["Gasabo", "Kicukiro", "Nyarugenge"],
  bugesera: ["Bugesera"]
};
const ADMIN_MAP_SOURCES: Record<SourceId, {
  baseUrl: string;
  layers: Record<AdminAreaLevel, number>;
}> = {
  kigali: {
    baseUrl: KIGALI_MAP_SERVER,
    layers: { district: 4, sector: 5, cell: 6, village: 7 }
  },
  bugesera: {
    baseUrl: BUGESERA_MAP_SERVER,
    layers: { district: 2, sector: 4, cell: 3, village: 5 }
  }
};
const DISTRICT_PRICE_SNAPSHOTS: Record<string, number> = {
  gasabo: 36103,
  kicukiro: 61499,
  nyarugenge: 50771,
  bugesera: 4038
};

const CANDIDATES: Record<AdminAreaLevel, { name: string[]; district: string[]; sector: string[]; cell: string[]; village: string[]; ids: Record<AdminAreaLevel, string[]> }> = {
  district: {
    name: ["district", "district_name", "district_1", "dist_name", "name", "name_e"],
    district: ["district", "district_name", "district_1", "dist_name"],
    sector: ["sector", "sector_name", "sector_1"],
    cell: ["cell", "cell_name", "cell_1", "cellule_1"],
    village: ["village", "village_name", "village_1"],
    ids: { district: ["district_id", "districtid", "dist_id", "distr_id", "distid", "code_dist", "objectid"], sector: [], cell: [], village: [] }
  },
  sector: {
    name: ["sector", "sector_name", "sector_1", "name", "name_e"],
    district: ["district", "district_name", "district_1", "dist_name"],
    sector: ["sector", "sector_name", "sector_1"],
    cell: ["cell", "cell_name", "cell_1", "cellule_1"],
    village: ["village", "village_name", "village_1"],
    ids: { district: ["district_id", "districtid", "dist_id", "distr_id", "distid", "code_dist"], sector: ["sector_id", "sectorid", "sect_id", "sectid", "code_sect", "objectid"], cell: [], village: [] }
  },
  cell: {
    name: ["cell", "cell_name", "cell_1", "cellule_1", "name", "name_e"],
    district: ["district", "district_name", "district_1", "dist_name"],
    sector: ["sector", "sector_name", "sector_1"],
    cell: ["cell", "cell_name", "cell_1", "cellule_1"],
    village: ["village", "village_name", "village_1"],
    ids: { district: ["district_id", "districtid", "dist_id", "distr_id", "distid", "code_dist"], sector: ["sector_id", "sectorid", "sect_id", "sectid", "code_sect"], cell: ["cell_id", "cellid", "code_cell_", "objectid"], village: [] }
  },
  village: {
    name: ["village", "village_name", "village_1", "name", "name_e"],
    district: ["district", "district_name", "district_1", "dist_name"],
    sector: ["sector", "sector_name", "sector_1"],
    cell: ["cell", "cell_name", "cell_1", "cellule_1"],
    village: ["village", "village_name", "village_1"],
    ids: { district: ["district_id", "districtid", "dist_id", "distr_id", "distid", "code_dist"], sector: ["sector_id", "sectorid", "sect_id", "sectid", "code_sect"], cell: ["cell_id", "cellid", "code_cell_"], village: ["village_id", "villageid", "code_village", "code_vill", "objectid"] }
  }
};

function normalizeKey(value: string): string {
  return value.toLocaleLowerCase("en").replace(/[^a-z0-9]/g, "");
}

function officialIdCandidates(candidates: string[]): string[] {
  // OBJECTID/FID identifies a row in a source layer, not the administrative
  // entity. Excluding it prevents layers with repeated OBJECTID=0 from
  // producing false parent IDs or collapsing distinct villages.
  return candidates.filter((candidate) =>
    !["objectid", "objectid1", "objectid12", "fid", "id"].includes(normalizeKey(candidate))
  );
}

function normalizeDistrictKey(value: string): string {
  return normalizeKey(value).replace(/district$/, "");
}

function chooseTextFields(fields: FieldMetadata[], candidates: string[]): string[] {
  return Array.from(new Set(candidates.flatMap((candidate) => {
    const field = fields.find((item) =>
      normalizeKey(item.name) === normalizeKey(candidate) &&
      (!item.type || item.type.toLocaleLowerCase("en").includes("string"))
    );
    return field ? [field.name] : [];
  })));
}

type HierarchyParentLevel = "district" | "sector" | "cell";

function orderedParentMappings(levels: HierarchyParentLevel[], count: number): HierarchyParentLevel[][] {
  const mappings: HierarchyParentLevel[][] = [];
  for (let mask = 1; mask < 1 << levels.length; mask += 1) {
    const mapping = levels.filter((_, index) => Boolean(mask & (1 << index)));
    if (mapping.length === count) mappings.push(mapping);
  }
  return mappings;
}

function hierarchyPathWhere(
  fields: FieldMetadata[],
  pathTokens: string[],
  level: AdminAreaLevel
): string | null {
  const parentLevels: HierarchyParentLevel[] = level === "cell"
    ? ["district", "sector"]
    : level === "village"
      ? ["district", "sector", "cell"]
      : level === "sector"
        ? ["district"]
        : [];
  if (pathTokens.length < 1 || pathTokens.length > parentLevels.length) return null;

  const candidates = CANDIDATES[level];
  const firstTokenIsDistrict = PILOT_DISTRICTS.has(normalizeDistrictKey(pathTokens[0]));
  const mappings = orderedParentMappings(parentLevels, pathTokens.length).filter((mapping) =>
    !firstTokenIsDistrict || mapping[0] === "district"
  );
  const alternatives = mappings.flatMap((mapping) => {
    const conditions = mapping.map((parentLevel, index) => {
      const fieldNames = chooseTextFields(fields, candidates[parentLevel]);
      if (fieldNames.length === 0) return null;
      let token = pathTokens[index].trim();
      if (parentLevel === "district") token = token.replace(/\s+district$/i, "").trim();
      const escaped = token.toLocaleUpperCase("en").replace(/'/g, "''");
      const values = parentLevel === "district" ? [escaped, escaped + " DISTRICT"] : [escaped];
      return "(" + fieldNames.map((field) =>
        "(" + values.map((value) => "UPPER(" + field + ") = '" + value + "'").join(" OR ") + ")"
      ).join(" OR ") + ")";
    });
    return conditions.every((condition): condition is string => condition !== null)
      ? ["(" + conditions.join(" AND ") + ")"]
      : [];
  });
  return alternatives.length > 0 ? "(" + alternatives.join(" OR ") + ")" : null;
}

function identifierListWhere(
  fields: FieldMetadata[],
  candidates: string[],
  values: string[]
): string | null {
  if (values.length === 0) return null;
  const fieldName = chooseField(fields, candidates);
  if (!fieldName) return null;
  const metadata = fields.find((field) => field.name === fieldName);
  const type = metadata?.type?.toLowerCase() ?? "";
  const isNumeric = type.includes("oid") || type.includes("integer") ||
    type.includes("double") || type.includes("smallinteger");
  const literals = values.map((raw) => {
    if (isNumeric) {
      const numeric = Number(raw);
      return Number.isFinite(numeric) ? String(numeric) : null;
    }
    return "'" + raw.replace(/'/g, "''") + "'";
  });
  if (literals.some((literal) => literal === null)) return null;
  return fieldName + " IN (" + literals.join(",") + ")";
}

function collectCoordinates(value: unknown, output: Array<[number, number]>): void {
  if (!Array.isArray(value)) return;
  if (
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number" &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  ) {
    output.push([value[0], value[1]]);
    return;
  }
  for (const child of value) collectCoordinates(child, output);
}

function boundsFromGeometry(geometry: unknown): [number, number, number, number] | null {
  if (!geometry || typeof geometry !== "object") return null;
  const object = geometry as Record<string, unknown>;
  const coordinates = "rings" in object ? object.rings : object.coordinates;
  const positions: Array<[number, number]> = [];
  collectCoordinates(coordinates, positions);
  if (positions.length === 0) return null;
  const bounds: [number, number, number, number] = [
    Math.min(...positions.map(([longitude]) => longitude)),
    Math.min(...positions.map(([, latitude]) => latitude)),
    Math.max(...positions.map(([longitude]) => longitude)),
    Math.max(...positions.map(([, latitude]) => latitude))
  ];
  return bounds.every(Number.isFinite) ? bounds : null;
}

function centerFromBounds(bounds: [number, number, number, number] | null): [number, number] | null {
  return bounds ? [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2] : null;
}


function chooseField(fields: FieldMetadata[], candidates: string[]): string | null {
  for (const candidate of candidates) {
    const key = normalizeKey(candidate);
    const match = fields.find((field) => normalizeKey(field.name) === key || normalizeKey(field.alias ?? "") === key);
    if (match) return match.name;
  }
  return null;
}

function value(attributes: Record<string, unknown>, candidates: string[]): string | null {
  const entries = Object.entries(attributes).map(([key, raw]) => [normalizeKey(key), raw] as const);
  for (const candidate of candidates) {
    const match = entries.find(([key]) => key === normalizeKey(candidate));
    if (match && match[1] !== null && match[1] !== undefined && String(match[1]).trim()) return String(match[1]).trim();
  }
  return null;
}

const metadataCache = new Map<string, Promise<LayerMetadata>>();
async function getLayerMetadata(url: string): Promise<LayerMetadata> {
  let pending = metadataCache.get(url);
  if (!pending) {
    pending = (async () => {
      const response = await fetch(url + "?f=json", {
        headers: { Accept: "application/json" },
        next: { revalidate: 86400 },
        signal: AbortSignal.timeout(8000)
      });
      if (!response.ok) throw new Error("GIS layer metadata unavailable (" + response.status + ")");
      const data = await response.json() as LayerMetadata;
      if (data.error) throw new Error(data.error.message ?? "GIS layer metadata failed");
      return data;
    })().catch((error) => {
      metadataCache.delete(url);
      throw error;
    });
    metadataCache.set(url, pending);
  }
  return pending;
}

async function searchLayer(
  source: SourceId,
  baseUrl: string,
  level: AdminAreaLevel,
  layerId: number,
  query: string,
  hierarchyPathTokens?: string[],
  parentCellIds?: string[],
  exactOnly = false
): Promise<SearchArea[]> {
  const layerUrl = baseUrl + "/" + layerId;
  const metadata = await getLayerMetadata(layerUrl);
  const fields = metadata.fields ?? [];
  const candidate = CANDIDATES[level];
  const nameFields = chooseTextFields(fields, candidate.name);
  if (nameFields.length === 0) return [];

  // Search the exact administrative layers that feed the map. This avoids
  // mismatches between the visible Kigali/Bugesera map data and a separate
  // national boundary dataset.
  const districtFields = level === "district"
    ? nameFields
    : chooseTextFields(fields, candidate.district);
  if (districtFields.length === 0 && source !== "bugesera") return [];
  const allowedDistrictValues = SOURCE_DISTRICTS[source].flatMap((name) => [
    name,
    name.toUpperCase(),
    name.toLowerCase(),
    name + " District",
    name.toUpperCase() + " DISTRICT"
  ]);
  const districtScopeWhere = districtFields.length === 0
    ? "1=1"
    : "(" + districtFields.map((field) =>
        "(" + allowedDistrictValues.map((districtName) =>
          "UPPER(" + field + ") = '" + districtName.toLocaleUpperCase("en").replace(/'/g, "''") + "'"
        ).join(" OR ") + ")"
      ).join(" OR ") + ")";
  const scopeToMappedDistricts = (where: string) =>
    "(" + districtScopeWhere + ") AND (" + where + ")";
  const hierarchyWhere = hierarchyPathTokens?.length
    ? hierarchyPathWhere(fields, hierarchyPathTokens, level)
    : null;
  const parentCellIdWhere = parentCellIds?.length
    ? identifierListWhere(fields, candidate.ids.cell, parentCellIds)
    : null;
  if ((hierarchyPathTokens?.length && !hierarchyWhere) || (parentCellIds?.length && !parentCellIdWhere)) return [];
  const hierarchyConditions = [hierarchyWhere, parentCellIdWhere].filter(
    (condition): condition is string => Boolean(condition)
  );
  const hierarchyFilter = hierarchyConditions.length ? hierarchyConditions.join(" AND ") : null;

  // ArcGIS SQL comparison can be case-sensitive on these published layers.
  // Normalise both sides in SQL so lowercase, uppercase, and mixed-case input behave alike.
  const escapedUpper = query.toLocaleUpperCase("en").replace(/'/g, "''");
  const requestedFields = new Set<string>(nameFields);
  const objectIdField = chooseField(fields, ["objectid", "objectid_1", "objectid_12", "fid", "id"]);
  if (objectIdField) requestedFields.add(objectIdField);
  for (const field of chooseTextFields(fields, ["province", "province_name", "prov_name", "province_e"])) requestedFields.add(field);
  for (const key of ["district", "sector", "cell", "village"] as const) {
    for (const field of chooseTextFields(fields, candidate[key])) requestedFields.add(field);
    const idField = chooseField(fields, candidate.ids[key]);
    if (idField) requestedFields.add(idField);
  }

  const commonParams = {
    outFields: Array.from(requestedFields).join(","),
    // Autocomplete returns names, hierarchy, and stable feature IDs only.
    // Full polygon geometry is fetched only after the user selects a result.
    returnGeometry: "false",
    f: "json"
  };
  const exactWhere = "(" + nameFields.map((field) =>
    "UPPER(" + field + ") = '" + escapedUpper + "'"
  ).join(" OR ") + ")";
  const prefixWhere = "(" + nameFields.map((field) =>
    "(UPPER(" + field + ") = '" + escapedUpper + "' OR UPPER(" + field + ") LIKE '" + escapedUpper + "%')"
  ).join(" OR ") + ")";
  const containsWhere = "(" + nameFields.map((field) =>
    "UPPER(" + field + ") LIKE '%" + escapedUpper + "%'"
  ).join(" OR ") + ")";

  const queryLayer = async (where: string): Promise<LayerQueryResponse> => {
    const params = new URLSearchParams({
      ...commonParams,
      where
    });
    // The map's administrative endpoints are older MapServer layers. They can
    // reject resultRecordCount/resultOffset as "Pagination is not supported".
    // A server-side name + district filter keeps each response scoped without
    // relying on paging.
    const response = await fetch(layerUrl + "/query?" + params.toString(), {
      headers: { Accept: "application/json" },
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) throw new Error("Administrative search failed (" + response.status + ")");
    const payload = await response.json() as LayerQueryResponse;
    if (payload.error) throw new Error(payload.error.message ?? "Administrative search query failed");
    return payload;
  };

  // Run prefix/exact matching alongside substring matching. This puts the
  // exact administrative name ahead of similarly named villages and prevents
  // common short prefixes from hiding the place the user actually typed.
  const withHierarchy = (where: string) =>
    scopeToMappedDistricts(hierarchyFilter ? "(" + hierarchyFilter + ") AND (" + where + ")" : where);
  const [prefixPayload, containsPayload] = exactOnly
    ? [await queryLayer(withHierarchy(exactWhere)), { features: [] } as LayerQueryResponse]
    : await Promise.all([
        queryLayer(withHierarchy(prefixWhere)),
        queryLayer(withHierarchy(containsWhere))
      ]);
  const features = [...(prefixPayload.features ?? []), ...(containsPayload.features ?? [])];

  return features.flatMap((feature, index) => {
    const attributes = feature.attributes ?? {};
    const name = value(attributes, nameFields);
    const district = (level === "district" ? name : value(attributes, chooseTextFields(fields, candidate.district))) ??
      (source === "bugesera" ? "Bugesera" : null);
    if (!name || !district || !PILOT_DISTRICTS.has(normalizeDistrictKey(district))) return [];
    const sector = level === "sector" ? name : value(attributes, chooseTextFields(fields, candidate.sector));
    const cell = level === "cell" ? name : value(attributes, chooseTextFields(fields, candidate.cell));
    const village = level === "village" ? name : value(attributes, chooseTextFields(fields, candidate.village));
    const ids = candidate.ids;
    const districtId = value(attributes, officialIdCandidates(ids.district ?? []));
    const sectorId = value(attributes, officialIdCandidates(ids.sector ?? []));
    const cellId = value(attributes, officialIdCandidates(ids.cell ?? []));
    const villageId = value(attributes, officialIdCandidates(ids.village ?? []));
    const province = value(attributes, ["province", "province_name", "prov_name", "province_e"]) ??
      (normalizeDistrictKey(district) === "bugesera" ? "Eastern Province" : "Kigali City");
    // The autocomplete query has no geometry. Keep the map feature ID so a
    // single exact geometry lookup can run when the user selects this result.
    const sourceObjectId = objectIdField ? value(attributes, [objectIdField]) : null;
    return [{
      id: [source, level, districtId ?? district, sectorId ?? sector, cellId ?? cell, villageId ?? village, sourceObjectId ?? index].filter(Boolean).join("-"),
      level,
      name,
      province,
      district,
      districtId,
      sector,
      sectorId,
      cell,
      cellId,
      village,
      villageId,
      averageLandPricePerM2: level === "district" ? DISTRICT_PRICE_SNAPSHOTS[normalizeDistrictKey(district)] ?? null : null,
      sourceLabel: source === "kigali"
        ? "Kigali City Master Plan administrative boundaries"
        : "Geodata Rwanda Bugesera Masterplan administrative boundaries",
      sourceType: "administrative-boundary" as const,
      mapSourceId: source,
      sourceObjectId,
      bounds: null,
      center: null
    }];
  });
}

async function searchVillageHierarchy(
  source: SourceId,
  baseUrl: string,
  layers: Record<AdminAreaLevel, number>,
  pathTokens: string[]
): Promise<SearchArea[]> {
  const villageName = pathTokens.at(-1) ?? "";
  const parentTokens = pathTokens.slice(0, -1);
  if (!villageName || parentTokens.length === 0) return [];

  const firstTokenIsDistrict = PILOT_DISTRICTS.has(normalizeDistrictKey(parentTokens[0]));
  const hasCellPath = (
    (parentTokens.length === 1 && !firstTokenIsDistrict) ||
    (parentTokens.length === 2 && !firstTokenIsDistrict) ||
    parentTokens.length === 3
  );

  if (!hasCellPath) {
    return searchLayer(source, baseUrl, "village", layers.village, villageName, parentTokens, undefined, true);
  }

  // Some Bugesera village polygons carry cell_id but omit the cell name.
  // Resolve the visible cell name against the parent cell layer first, then
  // use those official IDs to filter the village layer.
  const cellName = parentTokens.at(-1) ?? "";
  const cellParentTokens = parentTokens.slice(0, -1);
  const cells = await searchLayer(
    source,
    baseUrl,
    "cell",
    layers.cell,
    cellName,
    cellParentTokens.length ? cellParentTokens : undefined,
    undefined,
    true
  );
  const cellIds = Array.from(new Set(cells.map((area) => area.cellId).filter(
    (id): id is string => Boolean(id)
  )));
  console.info("Administrative hierarchy cell lookup.", {
    source,
    pathTokens,
    cellName,
    cellParentTokens,
    cellMatches: cells.map((area) => ({ name: area.name, cellId: area.cellId, district: area.district, sector: area.sector })),
    cellIds
  });
  if (cellIds.length === 0) {
    // A source that repeats its cell name in village records can still resolve
    // the path directly; never invent an ID when the cell layer omits one.
    return searchLayer(source, baseUrl, "village", layers.village, villageName, parentTokens, undefined, true);
  }

  const villages = await searchLayer(
    source,
    baseUrl,
    "village",
    layers.village,
    villageName,
    cellParentTokens.length ? cellParentTokens : undefined,
    cellIds,
    true
  );
  const cellNameById = new Map(cells.flatMap((area) =>
    area.cellId ? [[area.cellId, area.name] as const] : []
  ));
  console.info("Administrative hierarchy village lookup.", {
    source,
    villageName,
    cellIds,
    villageMatches: villages.map((area) => ({ name: area.name, cellId: area.cellId, district: area.district, sector: area.sector, cell: area.cell }))
  });
  return villages.map((area) => ({
    ...area,
    cell: area.cell ?? (area.cellId ? cellNameById.get(area.cellId) ?? null : null)
  }));
}

async function resolveAdminAreaGeometry(
  source: SourceId,
  level: AdminAreaLevel,
  target: {
    name: string;
    district: string;
    sector: string | null;
    cell: string | null;
    village: string | null;
    districtId: string | null;
    sectorId: string | null;
    cellId: string | null;
    villageId: string | null;
  }
): Promise<{ bounds: [number, number, number, number]; center: [number, number] }> {
  const sourceConfig = ADMIN_MAP_SOURCES[source];
  const layerUrl = sourceConfig.baseUrl + "/" + sourceConfig.layers[level];
  const metadata = await getLayerMetadata(layerUrl);
  const fields = metadata.fields ?? [];
  const candidates = CANDIDATES[level];
  const conditions: string[] = [];

  const quote = (raw: string) => "'" + raw.replace(/'/g, "''") + "'";
  const conditionForValue = (fieldName: string, rawValue: string) => {
    const field = fields.find((item) => item.name === fieldName);
    const kind = field?.type?.toLowerCase() ?? "";
    const numeric = kind.includes("oid") || kind.includes("integer") || kind.includes("double") || kind.includes("smallinteger");
    const numberValue = Number(rawValue);
    return numeric && Number.isFinite(numberValue)
      ? fieldName + " = " + String(numberValue)
      : fieldName + " = " + quote(rawValue);
  };
  const addTextCondition = (fieldCandidates: string[], rawValue: string | null) => {
    if (!rawValue) return;
    const field = chooseField(fields, fieldCandidates);
    if (field) conditions.push(conditionForValue(field, rawValue));
  };
  const addIdentifierCondition = (key: AdminAreaLevel, rawValue: string | null) => {
    if (!rawValue) return;
    // Never use OBJECTID/FID as an administrative parent ID. Some public layers
    // expose zero for every feature there; the real parent codes are separate fields.
    const idCandidates = candidates.ids[key].filter((candidate) =>
      !["objectid", "objectid1", "objectid12", "fid", "id"].includes(normalizeKey(candidate))
    );
    const field = chooseField(fields, idCandidates);
    if (field) conditions.push(conditionForValue(field, rawValue));
  };

  addTextCondition(candidates.name, target.name);
  if (level !== "district") {
    addTextCondition(candidates.district, target.district);
    addIdentifierCondition("district", target.districtId);
  }
  if (level === "cell" || level === "village") {
    addTextCondition(candidates.sector, target.sector);
    addIdentifierCondition("sector", target.sectorId);
  }
  if (level === "village") {
    addTextCondition(candidates.cell, target.cell);
    addIdentifierCondition("cell", target.cellId);
  }
  addIdentifierCondition(level, level === "district"
    ? target.districtId
    : level === "sector"
      ? target.sectorId
      : level === "cell"
        ? target.cellId
        : target.villageId);

  if (conditions.length === 0) throw new Error("No usable name or parent fields exist for this layer.");
  const params = new URLSearchParams({
    where: conditions.join(" AND "),
    outFields: "*",
    returnGeometry: "true",
    outSR: "4326",
    f: "json"
  });
  const response = await fetch(layerUrl + "/query?" + params.toString(), {
    headers: { Accept: "application/json" },
    next: { revalidate: 300 },
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error("Selected boundary lookup failed (" + response.status + ")");
  const payload = await response.json() as LayerQueryResponse;
  if (payload.error) throw new Error(payload.error.message ?? "Selected boundary lookup failed");

  const geometryFeature = (payload.features ?? []).find((feature) => boundsFromGeometry(feature.geometry) !== null);
  const bounds = boundsFromGeometry(geometryFeature?.geometry);
  if (!geometryFeature || !bounds) throw new Error("The selected boundary geometry was not returned.");
  return { bounds, center: centerFromBounds(bounds) as [number, number] };
}

type NominatimResult = {
  osm_type?: string;
  osm_id?: number;
  display_name?: string;
  lat?: string;
  lon?: string;
};

async function searchAddresses(query: string): Promise<SearchAddress[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("countrycodes", "rw");
  url.searchParams.set("viewbox", "28.7,-1.0,31.05,-2.95");
  url.searchParams.set("bounded", "1");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "6");

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "RwandaLandIntelligence/1.0 (address search)"
      },
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(6000)
    });
    if (!response.ok) throw new Error("Address search returned HTTP " + response.status);
    const results = await response.json() as NominatimResult[];
    return results.flatMap((item) => {
      const latitude = Number(item.lat);
      const longitude = Number(item.lon);
      const displayName = item.display_name?.trim();
      if (!displayName || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
      if (longitude < 28.7 || longitude > 31.05 || latitude < -2.95 || latitude > -1.0) return [];
      const name = displayName.split(",")[0]?.trim() || displayName;
      return [{
        id: "address-" + (item.osm_type ?? "place") + "-" + String(item.osm_id ?? displayName),
        kind: "address" as const,
        name,
        displayName,
        latitude,
        longitude,
        sourceLabel: "OpenStreetMap Nominatim geocoding"
      }];
    });
  } catch (error) {
    console.warn("Rwanda address geocoding is temporarily unavailable.", error);
    return [];
  }
}

function canonicalFullUpi(value: string): string | null {
  const normalized = value.trim().replace(/\s*[/.-]\s*/g, "/");
  return /^\d{1,2}(?:\/\d{1,2}){3}\/\d{1,7}$/.test(normalized) ? normalized : null;
}

async function searchParcels(source: SourceId, layerUrl: string, query: string): Promise<SearchArea[]> {
  const metadata = await getLayerMetadata(layerUrl);
  const fields = metadata.fields ?? [];
  const upiField = chooseField(fields, ["upi", "unique_parcel_identifier", "uniqueparcelidentifier"]);
  const parcelNumberField = chooseField(fields, ["parcel_number", "parcelnumber", "parcel_no", "parcelno"]);
  const parcelNumberMetadata = fields.find((field) => field.name === parcelNumberField);
  const parcelNumberIsText = Boolean(parcelNumberMetadata?.type?.toLowerCase().includes("string"));
  const fullUpi = canonicalFullUpi(query);
  const normalizedQuery = query.trim().replace(/\s+/g, " ");
  const escapedQuery = normalizedQuery.replace(/'/g, "''");
  const conditions: string[] = [];

  if (upiField) {
    const upiLookup = (fullUpi ?? normalizedQuery).replace(/'/g, "''");
    if (fullUpi) {
      // Treat the complete five-part UPI as one parcel identity. Do not query
      // the final segment as a parcel number, because parcel numbers can repeat by location.
      conditions.push(upiField + " = '" + upiLookup + "'");
      conditions.push(upiField + " LIKE '%" + upiLookup + "%'");
    } else {
      conditions.push(upiField + " LIKE '%" + escapedQuery + "%'");
    }
  }

  // Official parcel layers may store parcel_number as numeric. SQL LIKE on a
  // numeric field fails the whole ArcGIS query, even when UPI is also queried.
  if (!fullUpi && parcelNumberField) {
    if (parcelNumberIsText) {
      conditions.push(parcelNumberField + " LIKE '%" + escapedQuery + "%'");
    } else if (/^\d+(?:\.0+)?$/.test(normalizedQuery)) {
      const numericParcelNumber = Number(normalizedQuery);
      if (Number.isSafeInteger(numericParcelNumber)) {
        conditions.push(parcelNumberField + " = " + String(numericParcelNumber));
      }
    }
  }

  if (!conditions.length) return [];

  const fieldsToReturn = [
    upiField,
    chooseField(fields, ["province", "province_name"]),
    chooseField(fields, ["district", "district_name"]),
    chooseField(fields, ["sector", "sector_name"]),
    chooseField(fields, ["cell", "cell_name"]),
    chooseField(fields, ["village", "village_name"]),
    parcelNumberField,
    chooseField(fields, ["size", "parcel_size_m2", "area"]),
    chooseField(fields, ["last_updated_on", "lastupdatedon"])
  ].filter((field): field is string => Boolean(field));
  const params = new URLSearchParams({
    where: "(" + conditions.join(" OR ") + ")",
    outFields: Array.from(new Set(fieldsToReturn)).join(",") || "*",
    returnGeometry: "true",
    outSR: "4326",
    resultRecordCount: "25",
    f: "json"
  });
  const response = await fetch(layerUrl + "/query?" + params.toString(), {
    headers: { Accept: "application/json" },
    next: { revalidate: 300 },
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error("Parcel identifier search failed (" + response.status + ")");
  const payload = await response.json() as LayerQueryResponse;
  if (payload.error) throw new Error(payload.error.message ?? "Parcel identifier search failed");

  return (payload.features ?? []).flatMap((feature, index) => {
    const attributes = feature.attributes ?? {};
    const upi = value(attributes, ["upi", "unique_parcel_identifier", "uniqueparcelidentifier"]);
    const district = value(attributes, ["district", "district_name"]);
    const parcelNumber = value(attributes, ["parcel_number", "parcelnumber", "parcel_no", "parcelno"]);
    if (!upi || !district || !PILOT_DISTRICTS.has(normalizeDistrictKey(district))) return [];
    const sector = value(attributes, ["sector", "sector_name"]);
    const cell = value(attributes, ["cell", "cell_name"]);
    const village = value(attributes, ["village", "village_name"]);
    const sizeRaw = value(attributes, ["size", "parcel_size_m2", "area"]);
    const size = sizeRaw === null ? null : Number(sizeRaw);
    const updatedRaw = value(attributes, ["last_updated_on", "lastupdatedon"]);
    const updated = updatedRaw === null ? null : Number(updatedRaw);
    const bounds = boundsFromGeometry(feature.geometry);
    return [{
      id: "parcel-" + normalizeKey(upi),
      level: "parcel" as const,
      name: parcelNumber ? "Parcel " + parcelNumber : "Parcel " + upi,
      province: value(attributes, ["province"]) ?? (source === "bugesera" ? "Eastern Province" : "Kigali City"),
      district,
      districtId: null,
      sector,
      sectorId: null,
      cell,
      cellId: null,
      village,
      villageId: null,
      averageLandPricePerM2: null,
      sourceLabel: source === "kigali"
        ? "City of Kigali Master Plan · Kigali Parcels layer (1 June 2026)"
        : "National Land Authority · LAIS Bugesera_Parcels FeatureServer (reuse permission pending)",
      sourceType: "cadastral-parcel" as const,
      upi,
      parcelNumber,
      parcelSizeM2: size !== null && Number.isFinite(size) ? size : null,
      lastUpdatedOn: updated !== null && Number.isFinite(updated) ? updated : null,
      bounds,
      center: centerFromBounds(bounds)
    }];
  });
}
async function browseParcels(
  source: SourceId,
  layerUrl: string,
  offset: number
): Promise<{ areas: SearchArea[]; hasMore: boolean }> {
  const metadata = await getLayerMetadata(layerUrl);
  const fields = metadata.fields ?? [];
  const upiField = chooseField(fields, ["upi", "unique_parcel_identifier", "uniqueparcelidentifier"]);
  if (!upiField) return { areas: [], hasMore: false };
  const fieldsToReturn = [
    upiField,
    chooseField(fields, ["province", "province_name"]),
    chooseField(fields, ["district", "district_name"]),
    chooseField(fields, ["sector", "sector_name"]),
    chooseField(fields, ["cell", "cell_name"]),
    chooseField(fields, ["village", "village_name"]),
    chooseField(fields, ["parcel_number", "parcelnumber", "parcel_no", "parcelno"]),
    chooseField(fields, ["size", "parcel_size_m2", "area"]),
    chooseField(fields, ["last_updated_on", "lastupdatedon"])
  ].filter((field): field is string => Boolean(field));
  const params = new URLSearchParams({
    where: upiField + " IS NOT NULL",
    outFields: Array.from(new Set(fieldsToReturn)).join(","),
    returnGeometry: "false",
    resultRecordCount: "26",
    resultOffset: String(Math.max(0, offset)),
    orderByFields: upiField + " ASC",
    f: "json"
  });
  const response = await fetch(layerUrl + "/query?" + params.toString(), {
    headers: { Accept: "application/json" },
    next: { revalidate: 300 },
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error("Parcel browsing failed (" + response.status + ")");
  const payload = await response.json() as LayerQueryResponse;
  if (payload.error) throw new Error(payload.error.message ?? "Parcel browsing failed");
  const features = payload.features ?? [];
  const hasMore = features.length > 25 || payload.exceededTransferLimit === true;
  const areas = features.slice(0, 25).flatMap((feature) => {
    const attributes = feature.attributes ?? {};
    const upi = value(attributes, ["upi", "unique_parcel_identifier", "uniqueparcelidentifier"]);
    const district = value(attributes, ["district", "district_name"]);
    const parcelNumber = value(attributes, ["parcel_number", "parcelnumber", "parcel_no", "parcelno"]);
    if (!upi || !district || !PILOT_DISTRICTS.has(normalizeDistrictKey(district))) return [];
    const sector = value(attributes, ["sector", "sector_name"]);
    const cell = value(attributes, ["cell", "cell_name"]);
    const village = value(attributes, ["village", "village_name"]);
    const sizeRaw = value(attributes, ["size", "parcel_size_m2", "area"]);
    const size = sizeRaw === null ? null : Number(sizeRaw);
    const updatedRaw = value(attributes, ["last_updated_on", "lastupdatedon"]);
    const updated = updatedRaw === null ? null : Number(updatedRaw);
    return [{
      id: "parcel-" + normalizeKey(upi),
      level: "parcel" as const,
      name: parcelNumber ? "Parcel " + parcelNumber : "Parcel " + upi,
      province: value(attributes, ["province"]) ?? (source === "bugesera" ? "Eastern Province" : "Kigali City"),
      district,
      districtId: null,
      sector,
      sectorId: null,
      cell,
      cellId: null,
      village,
      villageId: null,
      averageLandPricePerM2: null,
      sourceLabel: source === "kigali"
        ? "City of Kigali Master Plan · Kigali Parcels layer (1 June 2026)"
        : "National Land Authority · LAIS Bugesera_Parcels FeatureServer (reuse permission pending)",
      sourceType: "cadastral-parcel" as const,
      upi,
      parcelNumber,
      parcelSizeM2: size !== null && Number.isFinite(size) ? size : null,
      lastUpdatedOn: updated !== null && Number.isFinite(updated) ? updated : null,
      bounds: null
    }];
  });
  return { areas, hasMore };
}

export async function GET(request: NextRequest) {
  const rawQuery = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const addressOnly = request.nextUrl.searchParams.get("addressOnly") === "1";
  if (request.nextUrl.searchParams.get("resolveGeometry") === "1") {
    const rawSource = request.nextUrl.searchParams.get("source");
    const rawLevel = request.nextUrl.searchParams.get("level");
    const target = {
      name: request.nextUrl.searchParams.get("name")?.trim() ?? "",
      district: request.nextUrl.searchParams.get("district")?.trim() ?? "",
      sector: request.nextUrl.searchParams.get("sector")?.trim() || null,
      cell: request.nextUrl.searchParams.get("cell")?.trim() || null,
      village: request.nextUrl.searchParams.get("village")?.trim() || null,
      districtId: request.nextUrl.searchParams.get("districtId")?.trim() || null,
      sectorId: request.nextUrl.searchParams.get("sectorId")?.trim() || null,
      cellId: request.nextUrl.searchParams.get("cellId")?.trim() || null,
      villageId: request.nextUrl.searchParams.get("villageId")?.trim() || null
    };
    if (
      (rawSource !== "kigali" && rawSource !== "bugesera") ||
      !["district", "sector", "cell", "village"].includes(rawLevel ?? "") ||
      !target.name
    ) {
      return NextResponse.json({ error: "A mapped source, administrative level, and area name are required." }, { status: 400 });
    }
    try {
      const resolved = await resolveAdminAreaGeometry(rawSource, rawLevel as AdminAreaLevel, target);
      return NextResponse.json(resolved, {
        headers: { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=1800" }
      });
    } catch (error) {
      console.error("Selected administrative boundary resolution failed.", error);
      return NextResponse.json({ error: "The selected administrative boundary could not be resolved." }, { status: 502 });
    }
  }
  const browseMode = request.nextUrl.searchParams.get("browse") === "1" && rawQuery.length < 2;
  if (rawQuery.length < 2 && !browseMode) {
    return NextResponse.json({ areas: [], message: "Enter at least two characters or focus the search to browse parcels." }, {
      headers: { "Cache-Control": "public, max-age=30, s-maxage=60" }
    });
  }
  const cleanedQuery = rawQuery.slice(0, 80)
    .replace(/^\s*(?:district|sector|cell|village)\s*[:=-]?\s+/i, "")
    .replace(/\s+(?:district|sector|cell|village)$/i, "")
    .trim();
  const cleanedKey = normalizeKey(cleanedQuery);
  // Search aliases are input helpers only. Results always show the exact name
  // from the mapped administrative source, never the alias supplied by a user.
  const kibagabagaAliases = ["kivagagaga", "kivagabaga", "kiwagabaga", "kibagabaga"];
  const isKibagabagaAlias = cleanedKey.length >= 4 && kibagabagaAliases.some(
    (alias) => alias.startsWith(cleanedKey) || cleanedKey.startsWith(alias)
  );
  const bugeseraAliases = ["wijesera", "wugesera", "wujezera"];
  const isBugeseraAlias = cleanedKey.length >= 4 && bugeseraAliases.some(
    (alias) => alias.startsWith(cleanedKey) || cleanedKey.startsWith(alias)
  );
  const query = isKibagabagaAlias
    ? "Kibagabaga"
    : isBugeseraAlias
      ? "Bugesera"
      : cleanedQuery;
  const fullUpiQuery = canonicalFullUpi(query);
  const sources = [
    { id: "kigali" as const, baseUrl: KIGALI_MAP_SERVER, parcelUrl: KIGALI_PARCELS, layers: { district: 4, sector: 5, cell: 6, village: 7 } },
    { id: "bugesera" as const, baseUrl: BUGESERA_MAP_SERVER, parcelUrl: BUGESERA_PARCELS, layers: { district: 2, sector: 4, cell: 3, village: 5 } }
  ];

  // Public geocoding is explicit on submit, not called on every autocomplete
  // keystroke. This respects shared geocoder capacity and avoids noisy traffic.
  if (addressOnly) {
    if (query.length < 4) {
      return NextResponse.json({ addresses: [], searched: query, message: "Enter a longer address." }, {
        headers: { "Cache-Control": "public, max-age=0, s-maxage=300" }
      });
    }
    const addresses = await searchAddresses(query);
    return NextResponse.json({
      addresses,
      searched: query,
      sourceLabel: "OpenStreetMap Nominatim geocoding"
    }, {
      headers: {
        "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=1800",
        "X-Data-Source": "OpenStreetMap Nominatim geocoding"
      }
    });
  }

  if (browseMode) {
    const offsetRaw = Number(request.nextUrl.searchParams.get("offset") ?? 0);
    const offset = Number.isFinite(offsetRaw) ? Math.max(0, Math.min(1_000_000, Math.floor(offsetRaw))) : 0;
    const pages = await Promise.all(sources.map(async (source) => {
      try {
        const page = await browseParcels(source.id, source.parcelUrl, offset);
        return { ...page, failed: false };
      } catch (error) {
        console.error("Parcel browse failed for " + source.id + ".", error);
        return { areas: [] as SearchArea[], hasMore: false, failed: true };
      }
    }));
    const byUpi = new Map<string, SearchArea>();
    for (const page of pages) for (const area of page.areas) {
      const key = normalizeKey(area.upi ?? area.name);
      if (!byUpi.has(key)) byUpi.set(key, area);
    }
    const areas = Array.from(byUpi.values()).sort((a, b) =>
      (a.district + "|" + (a.sector ?? "") + "|" + (a.cell ?? "") + "|" + (a.upi ?? ""))
        .localeCompare(b.district + "|" + (b.sector ?? "") + "|" + (b.cell ?? "") + "|" + (b.upi ?? ""))
    );
    if (pages.every((page) => page.failed)) {
      return NextResponse.json({ error: "Parcel browsing services are temporarily unavailable." }, { status: 502 });
    }
    return NextResponse.json({
      areas,
      searched: "",
      browse: true,
      offset,
      nextOffset: offset + 25,
      hasMore: pages.some((page) => page.hasMore),
      coverage: "Cadastral parcel records from the Kigali City and Bugesera pilot sources"
    }, {
      headers: {
        "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=1800",
        "X-Data-Source": "Kigali City Master Plan; National Land Authority LAIS Bugesera parcels"
      }
    });
  }

  const hierarchyPathTokens = query
    .split(/[,>›|]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const isHierarchyPath = hierarchyPathTokens.length >= 2 &&
    hierarchyPathTokens.length <= 4 &&
    hierarchyPathTokens.every((part) => part.length >= 2 && part.length <= 60);
  const hierarchySearchTokens = isHierarchyPath ? hierarchyPathTokens : null;
  const administrativeNameQuery = hierarchySearchTokens?.at(-1) ?? query;

  const adminSources = Object.entries(ADMIN_MAP_SOURCES) as Array<[SourceId, typeof ADMIN_MAP_SOURCES[SourceId]]>;
  const adminTasks = adminSources.flatMap(([sourceId, source]) => {
    const levels = hierarchySearchTokens
      ? ([["village", source.layers.village]] as Array<[AdminAreaLevel, number]>)
      : (Object.entries(source.layers) as Array<[AdminAreaLevel, number]>);
    return levels.map(([level, layerId]) =>
      (hierarchySearchTokens
        ? searchVillageHierarchy(sourceId, source.baseUrl, source.layers, hierarchySearchTokens)
        : searchLayer(sourceId, source.baseUrl, level, layerId, administrativeNameQuery))
        .then((areas) => ({ areas, failed: false, kind: "administrative" as const }))
        .catch((error) => {
          console.error("Mapped administrative search failed for " + sourceId + " " + level + ".", error);
          return { areas: [] as SearchArea[], failed: true, kind: "administrative" as const };
        })
    );
  });
  const shouldSearchParcels = !hierarchySearchTokens && (/\d/.test(query) || fullUpiQuery !== null);
  const parcelTasks = shouldSearchParcels
    ? sources.map((source) =>
        searchParcels(source.id, source.parcelUrl, query)
          .then((areas) => ({ areas, failed: false, kind: "parcel" as const }))
          .catch((error) => {
            console.error("Parcel identifier search failed for " + source.id + ".", error);
            return { areas: [] as SearchArea[], failed: true, kind: "parcel" as const };
          })
      )
    : [];
  const tasks = [...adminTasks, ...parcelTasks];
  const results = await Promise.all(tasks);
  const administrativeResults = results.filter((result) => result.kind === "administrative");
  if (administrativeResults.length === 0 || administrativeResults.every((result) => result.failed)) {
    return NextResponse.json({ error: "The map's administrative search sources are temporarily unavailable." }, { status: 502 });
  }
  const allAreas = results.flatMap((result) => result.areas);
  const areas = fullUpiQuery
    ? allAreas.filter((area) => area.level === "parcel" && normalizeKey(area.upi ?? "") === normalizeKey(fullUpiQuery))
    : allAreas;
  const deduplicated = new Map<string, SearchArea>();
  for (const area of areas) {
    if (area.level === "parcel") {
      const key = "parcel|" + normalizeKey(area.upi ?? area.parcelNumber ?? area.name);
      if (!deduplicated.has(key)) deduplicated.set(key, area);
      continue;
    }

    // Prefer the official administrative ID, namespaced by source and level.
    // Bugesera's village layer can omit the cell name, and multiple villages
    // may share the same displayed name inside a sector. Name-only dedupe
    // silently removed valid records; their official village IDs keep them.
    const source = area.mapSourceId ?? normalizeKey(area.sourceLabel);
    const officialId = area.level === "district"
      ? area.districtId
      : area.level === "sector"
        ? area.sectorId
        : area.level === "cell"
          ? area.cellId
          : area.villageId;
    const key = officialId
      ? [source, area.level, "id", normalizeKey(officialId)].join("|")
      : [
          source,
          area.level,
          normalizeKey(area.district),
          normalizeKey(area.sector ?? ""),
          normalizeKey(area.cell ?? ""),
          normalizeKey(area.village ?? ""),
          normalizeKey(area.name)
        ].join("|");
    if (!deduplicated.has(key)) deduplicated.set(key, area);
  }
  const normalizedQuery = normalizeKey(administrativeNameQuery);
  const matchRank = (area: SearchArea) => {
    const labels = [area.name, area.upi, area.parcelNumber].filter((value): value is string => Boolean(value)).map(normalizeKey);
    if (labels.some((value) => value === normalizedQuery)) return 0;
    if (labels.some((value) => value.startsWith(normalizedQuery))) return 1;
    if (labels.some((value) => value.includes(normalizedQuery))) return 2;
    return 3;
  };
  const order: Record<AreaLevel, number> = { district: 0, sector: 1, cell: 2, village: 3, parcel: 4 };
  const sorted = Array.from(deduplicated.values()).sort((a, b) => {
    const relevanceDifference = matchRank(a) - matchRank(b);
    if (relevanceDifference !== 0) return relevanceDifference;
    return order[a.level] - order[b.level] || a.name.localeCompare(b.name) ||
      a.district.localeCompare(b.district) || (a.sector ?? "").localeCompare(b.sector ?? "");
  }).slice(0, 80);

  return NextResponse.json({
    areas: sorted,
    searched: query,
    coverage: "Mapped administrative layers: Kigali City Master Plan (Gasabo, Kicukiro and Nyarugenge) and Geodata Rwanda Bugesera Masterplan; cadastral search from connected parcel sources"
  }, {
    headers: {
      "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=1800",
      "X-Data-Source": "Kigali City Master Plan; Geodata Rwanda Bugesera Masterplan; cadastral sources"
    }
  });
}
