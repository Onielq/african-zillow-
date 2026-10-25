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
type FieldMetadata = { name: string; alias?: string };
type LayerMetadata = { fields?: FieldMetadata[]; error?: { message?: string } };
type LayerQueryResponse = { features?: Array<{ attributes?: Record<string, unknown> }>; error?: { code?: number; message?: string } };

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
  upi?: string | null;
  parcelNumber?: string | null;
  parcelSizeM2?: number | null;
  lastUpdatedOn?: number | null;
  bounds?: [number, number, number, number] | null;
};

const PILOT_DISTRICTS = new Set(["gasabo", "kicukiro", "nyarugenge", "bugesera"]);
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

async function searchLayer(source: SourceId, baseUrl: string, level: AdminAreaLevel, layerId: number, query: string): Promise<SearchArea[]> {
  const layerUrl = baseUrl + "/" + layerId;
  const metadata = await getLayerMetadata(layerUrl);
  const fields = metadata.fields ?? [];
  const candidate = CANDIDATES[level];
  const nameField = chooseField(fields, candidate.name);
  if (!nameField) return [];

  const escaped = query.replace(/'/g, "''");
  // Query only fields needed to label and distinguish matching areas. This
  // keeps administrative search payloads small while preserving hierarchy IDs.
  const requestedFields = new Set<string>([nameField]);
  for (const key of ["district", "sector", "cell", "village"] as const) {
    const field = chooseField(fields, candidate[key]);
    if (field) requestedFields.add(field);
    const idField = chooseField(fields, candidate.ids[key]);
    if (idField) requestedFields.add(idField);
  }
  const params = new URLSearchParams({
    where: nameField + " LIKE " + "'%" + escaped + "%'",
    outFields: Array.from(requestedFields).join(","),
    returnGeometry: "false",
    f: "json"
  });
  const response = await fetch(layerUrl + "/query?" + params.toString(), {
    headers: { Accept: "application/json" },
    next: { revalidate: 300 },
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error("Administrative search failed (" + response.status + ")");
  const payload = await response.json() as LayerQueryResponse;
  if (payload.error) throw new Error(payload.error.message ?? "Administrative search query failed");

  return (payload.features ?? []).flatMap((feature, index) => {
    const attributes = feature.attributes ?? {};
    const name = value(attributes, candidate.name);
    const district = (level === "district" ? name : value(attributes, candidate.district)) ??
      (source === "bugesera" ? "Bugesera" : null);
    if (!name || !district || !PILOT_DISTRICTS.has(district.toLocaleLowerCase("en"))) return [];
    const sector = level === "sector" ? name : value(attributes, candidate.sector);
    const cell = level === "cell" ? name : value(attributes, candidate.cell);
    const village = level === "village" ? name : value(attributes, candidate.village);
    const ids = candidate.ids;
    const districtId = value(attributes, ids.district ?? []);
    const sectorId = value(attributes, ids.sector ?? []);
    const cellId = value(attributes, ids.cell ?? []);
    const villageId = value(attributes, ids.village ?? []);
    const province = source === "bugesera"
      ? "Eastern Province"
      : value(attributes, ["province", "prov_name", "province_name", "province_e"]) ?? "Kigali City";
    return [{
      id: [source, level, districtId ?? district, sectorId ?? sector, cellId ?? cell, villageId ?? village, index].filter(Boolean).join("-"),
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
      averageLandPricePerM2: level === "district" ? DISTRICT_PRICE_SNAPSHOTS[district.toLocaleLowerCase("en")] ?? null : null,
      sourceLabel: source === "kigali"
        ? "Kigali City Master Plan administrative boundaries"
        : "Geodata Rwanda Bugesera Masterplan administrative boundaries",
      sourceType: "administrative-boundary" as const
    }];
  });
}

async function searchParcels(source: SourceId, layerUrl: string, query: string): Promise<SearchArea[]> {
  const escaped = query.replace(/'/g, "''");
  const params = new URLSearchParams({
    where: "upi LIKE '%" + escaped + "%' OR parcel_number LIKE '%" + escaped + "%'",
    outFields: "upi,province,district,sector,cell,village,parcel_number,size,last_updated_on",
    returnGeometry: "false",
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
    const upi = value(attributes, ["upi"]);
    const district = value(attributes, ["district", "district_name"]);
    const parcelNumber = value(attributes, ["parcel_number", "parcelnumber"]);
    if (!upi || !district || !PILOT_DISTRICTS.has(normalizeKey(district))) return [];
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
}

export async function GET(request: NextRequest) {
  const rawQuery = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (rawQuery.length < 2) {
    return NextResponse.json({ areas: [], message: "Enter at least two characters." }, {
      headers: { "Cache-Control": "public, max-age=30, s-maxage=60" }
    });
  }
  const query = rawQuery.slice(0, 80);
  const sources = [
    { id: "kigali" as const, baseUrl: KIGALI_MAP_SERVER, parcelUrl: KIGALI_PARCELS, layers: { district: 4, sector: 5, cell: 6, village: 7 } },
    { id: "bugesera" as const, baseUrl: BUGESERA_MAP_SERVER, parcelUrl: BUGESERA_PARCELS, layers: { district: 2, sector: 4, cell: 3, village: 5 } }
  ];
  const tasks = [
    ...sources.flatMap((source) =>
      (Object.entries(source.layers) as Array<[AdminAreaLevel, number]>).map(([level, layerId]) =>
        searchLayer(source.id, source.baseUrl, level, layerId, query)
          .then((areas) => ({ areas, failed: false }))
          .catch((error) => {
            console.error("Comparison area search failed for " + source.id + " " + level + ".", error);
            return { areas: [] as SearchArea[], failed: true };
          })
      )
    ),
    ...sources.map((source) =>
      searchParcels(source.id, source.parcelUrl, query)
        .then((areas) => ({ areas, failed: false }))
        .catch((error) => {
          console.error("Parcel identifier search failed for " + source.id + ".", error);
          return { areas: [] as SearchArea[], failed: true };
        })
    )
  ];
  const results = await Promise.all(tasks);
  const areas = results.flatMap((result) => result.areas);
  const deduplicated = new Map<string, SearchArea>();
  for (const area of areas) {
    const key = area.level === "parcel"
      ? "parcel|" + normalizeKey(area.upi ?? area.parcelNumber ?? area.name)
      : [area.level, normalizeKey(area.district), normalizeKey(area.sector ?? ""), normalizeKey(area.cell ?? ""), normalizeKey(area.village ?? ""), normalizeKey(area.name)].join("|");
    if (!deduplicated.has(key)) deduplicated.set(key, area);
  }
  const sorted = Array.from(deduplicated.values()).sort((a, b) => {
    const aExact = [a.name, a.upi, a.parcelNumber].some((value) => normalizeKey(value ?? "") === normalizeKey(query)) ? 0 : 1;
    const bExact = [b.name, b.upi, b.parcelNumber].some((value) => normalizeKey(value ?? "") === normalizeKey(query)) ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;
    const order: Record<AreaLevel, number> = { district: 0, sector: 1, cell: 2, village: 3, parcel: 4 };
    return order[a.level] - order[b.level] || a.name.localeCompare(b.name);
  }).slice(0, 80);

  if (results.every((result) => result.failed)) {
    return NextResponse.json({ error: "The administrative search services are unavailable." }, { status: 502 });
  }
  return NextResponse.json({
    areas: sorted,
    searched: query,
    coverage: "Pilot administrative hierarchy: Gasabo, Kicukiro, Nyarugenge and Bugesera"
  }, {
    headers: {
      "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=1800",
      "X-Data-Source": "Kigali City Master Plan; Geodata Rwanda Bugesera Masterplan"
    }
  });
}
