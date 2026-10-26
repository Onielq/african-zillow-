import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const revalidate = 1800;

const KIGALI_PARCEL_FEATURE_LAYER =
  "https://masterplan.kigalicity.gov.rw/server/rest/services/Hosted/Kigali_Parcels_1June2026_for_search/FeatureServer/0";
const BUGESERA_PARCEL_FEATURE_LAYER =
  "https://services7.arcgis.com/htgaiKX6RV2DDGgK/arcgis/rest/services/Bugesera_Parcels/FeatureServer/0";
const KIGALI_ZONING_LAYER =
  "https://masterplan.kigalicity.gov.rw/server/rest/services/Masterplan2020/Masterplan2020_22Apr2026/MapServer/117";
const BUGESERA_ZONING_LAYER =
  "https://geodata.rw/server/rest/services/masterplan/Bugesera_DLUP/FeatureServer/0";

type ArcGisGeometry = {
  rings?: unknown;
  spatialReference?: { wkid?: number; latestWkid?: number };
};
type ArcGisFeature = {
  attributes?: Record<string, unknown>;
  geometry?: ArcGisGeometry | null;
};
type ArcGisResponse = {
  features?: ArcGisFeature[];
  error?: { code?: number; message?: string; details?: string[] };
};

function hasPolygonGeometry(geometry: ArcGisGeometry | null | undefined): geometry is ArcGisGeometry & { rings: unknown[] } {
  return Boolean(geometry && Array.isArray(geometry.rings) && geometry.rings.length > 0);
}
type ParcelZoning = {
  code: string | null;
  name: string;
  condition: string | null;
  prohibited: string | null;
  buffer: string | null;
  sourceListsMultipleCodes?: boolean;
};

function normaliseFieldName(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normaliseValue(value: unknown): string {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLowerCase();
}

function readText(attributes: Record<string, unknown> | undefined, candidates: string[]): string | null {
  if (!attributes) return null;
  const wanted = new Set(candidates.map(normaliseFieldName));
  for (const [key, value] of Object.entries(attributes)) {
    if (!wanted.has(normaliseFieldName(key))) continue;
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function quoteSql(value: string): string {
  return "'" + value.replace(/'/g, "''") + "'";
}

async function queryArcGis(
  layerUrl: string,
  parameters: URLSearchParams,
  method: "GET" | "POST"
): Promise<ArcGisResponse> {
  const url = method === "GET" ? layerUrl + "/query?" + parameters.toString() : layerUrl + "/query";
  const response = await fetch(url, {
    method,
    headers: method === "POST"
      ? { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" }
      : { Accept: "application/json" },
    body: method === "POST" ? parameters.toString() : undefined,
    next: { revalidate },
    signal: AbortSignal.timeout(15_000)
  });
  if (!response.ok) throw new Error("ArcGIS query failed (" + response.status + ")");
  const payload = await response.json() as ArcGisResponse;
  if (payload.error) {
    throw new Error("ArcGIS " + (payload.error.code ?? "error") + ": " + (payload.error.message ?? "query failed"));
  }
  return payload;
}

/**
 * Some source records place several short zone codes in one text field (for
 * example "R2, T"). Split only code-like tokens; do not split ordinary
 * descriptive names that happen to contain commas.
 */
function splitSimpleZoneCodes(value: string | null): string[] | null {
  if (!value) return null;
  const parts = value.split(/[,;|]/).map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2 || !parts.every((part) => /^[A-Z][A-Z0-9_-]{0,15}$/i.test(part))) {
    return null;
  }
  return [...new Set(parts)];
}

function normaliseZones(features: ArcGisFeature[]): ParcelZoning[] {
  const zones = new Map<string, ParcelZoning>();
  for (const feature of features) {
    const attributes = feature.attributes ?? {};
    const name = readText(attributes, [
      "new_zoning", "zoning", "zone_name", "land_use", "gen_lu",
      "zoning_class", "main_zoning", "zone_code", "lu_code"
    ]);
    const code = readText(attributes, [
      "zone_code", "lu_code", "main_zone_code", "zoning_code", "zone"
    ]);
    const condition = readText(attributes, ["conditiona", "conditional", "condition", "conditions"]);
    const prohibited = readText(attributes, ["prohibited", "prohibited_uses", "prohibitions"]);
    const buffer = readText(attributes, ["buffer_zon", "buff_detai", "buffer_zone", "buffer_detail"]);
    const label = name ?? code ?? "Classification not supplied by source";
    const nameParts = splitSimpleZoneCodes(name);
    const codeParts = splitSimpleZoneCodes(code);
    const combinedCodes = codeParts ?? nameParts;
    const candidates: ParcelZoning[] = combinedCodes
      ? combinedCodes.map((part) => ({
          code: part,
          name: nameParts ? part : name ?? part,
          condition,
          prohibited,
          buffer,
          sourceListsMultipleCodes: true
        }))
      : [{ code, name: label, condition, prohibited, buffer }];

    for (const next of candidates) {
      const key = normaliseValue(next.code ?? next.name);
      const previous = zones.get(key);
      if (!previous) {
        zones.set(key, next);
      } else {
        zones.set(key, {
          code: previous.code ?? next.code,
          name: previous.name || next.name,
          condition: previous.condition ?? next.condition,
          prohibited: previous.prohibited ?? next.prohibited,
          buffer: previous.buffer ?? next.buffer,
          sourceListsMultipleCodes: previous.sourceListsMultipleCodes || next.sourceListsMultipleCodes
        });
      }
    }
  }
  return [...zones.values()].sort((a, b) =>
    (a.code ?? a.name).localeCompare(b.code ?? b.name, "en")
  );
}

export async function GET(request: NextRequest) {
  const district = request.nextUrl.searchParams.get("district")?.trim() ?? "";
  const upi = request.nextUrl.searchParams.get("upi")?.trim() ?? "";
  const districtKey = normaliseValue(district);
  const isBugesera = districtKey === "bugesera";
  const isKigaliDistrict = ["gasabo", "kicukiro", "nyarugenge"].includes(districtKey);

  if (!isBugesera && !isKigaliDistrict) {
    return NextResponse.json({ error: "district must be Gasabo, Kicukiro, Nyarugenge, or Bugesera" }, { status: 400 });
  }
  if (!upi || upi.length > 80) {
    return NextResponse.json({ error: "A valid parcel UPI is required" }, { status: 400 });
  }

  const parcelLayer = isBugesera ? BUGESERA_PARCEL_FEATURE_LAYER : KIGALI_PARCEL_FEATURE_LAYER;
  const zoningLayer = isBugesera ? BUGESERA_ZONING_LAYER : KIGALI_ZONING_LAYER;
  const source = isBugesera
    ? "National Land Authority / Geodata Rwanda · Bugesera District Land Use Plan zoning layer"
    : "City of Kigali · Master Plan Proposed Zoning Plan (MapServer layer 117, 22 April 2026 service)";

  try {
    // Resolve the original cadastral geometry by UPI. Do not approximate the
    // parcel from roads, satellite pixels, a bounding box, or a zoning polygon.
    const parcelParams = new URLSearchParams({
      where: "upi = " + quoteSql(upi),
      outFields: "upi,district",
      returnGeometry: "true",
      outSR: "4326",
      resultRecordCount: "100",
      f: "json"
    });
    const parcelPayload = await queryArcGis(parcelLayer, parcelParams, "GET");
    const matchingParcel = (parcelPayload.features ?? []).find((feature) =>
      normaliseValue(readText(feature.attributes, ["district"])) === districtKey &&
      hasPolygonGeometry(feature.geometry)
    );
    if (!matchingParcel || !hasPolygonGeometry(matchingParcel.geometry)) {
      return NextResponse.json({
        error: "The parcel geometry could not be resolved from the connected cadastral source."
      }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }

    // Ask the published zoning feature service which zone polygons intersect
    // the exact cadastral polygon. A parcel crossing a zone boundary can return
    // multiple designations, which are preserved rather than guessing one.
    const parcelGeometry = matchingParcel.geometry;
    const zoningParams = new URLSearchParams({
      where: "1=1",
      geometry: JSON.stringify(parcelGeometry),
      geometryType: "esriGeometryPolygon",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "*",
      returnGeometry: "false",
      resultRecordCount: "2000",
      f: "json"
    });
    const zoningPayload = await queryArcGis(zoningLayer, zoningParams, "POST");
    const zones = normaliseZones(zoningPayload.features ?? []);

    return NextResponse.json({
      status: zones.length > 0 ? "found" : "not-covered",
      zones,
      source,
      note: "All distinct zoning designations intersecting the cadastral parcel are shown. A planning designation is not proof of ownership or development approval."
    }, {
      headers: {
        "Cache-Control": "public, max-age=0, s-maxage=1800, stale-while-revalidate=86400",
        "X-Parcel-Geometry": "Exact polygon resolved by UPI from the connected cadastral service",
        "X-Zoning-Source": source
      }
    });
  } catch (error) {
    console.error("Parcel zoning lookup failed.", error);
    return NextResponse.json({
      error: "The parcel or zoning service is temporarily unavailable."
    }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
