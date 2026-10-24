import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const revalidate = 1800;

type Bounds = [number, number, number, number];
type GeoJsonFeature = {
  type: "Feature";
  id?: string | number;
  geometry: { type: string; coordinates: unknown } | null;
  properties?: Record<string, unknown> | null;
};
type GeoJsonCollection = { type: "FeatureCollection"; features?: GeoJsonFeature[]; error?: { code?: number; message?: string } };

const KIGALI_ZONING_LAYER =
  "https://masterplan.kigalicity.gov.rw/server/rest/services/Masterplan2020/Masterplan2020_22Apr2026/MapServer/117";
const BUGESERA_ZONING_LAYER =
  "https://geodata.rw/server/rest/services/masterplan/Bugesera_DLUP/FeatureServer/0";
const KIGALI_EXTENT: Bounds = [29.58, -2.12, 30.32, -1.47];
const BUGESERA_EXTENT: Bounds = [29.82, -2.62, 30.56, -1.92];

function parseBounds(value: string | null): Bounds | null {
  if (!value) return null;
  const parts = value.split(",").map((part) => Number(part.trim()));
  if (parts.length !== 4 || !parts.every(Number.isFinite)) return null;
  const [west, south, east, north] = parts;
  if (west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north) return null;
  return [west, south, east, north];
}

function intersect(a: Bounds, b: Bounds): Bounds | null {
  const result: Bounds = [
    Math.max(a[0], b[0]),
    Math.max(a[1], b[1]),
    Math.min(a[2], b[2]),
    Math.min(a[3], b[3])
  ];
  return result[0] < result[2] && result[1] < result[3] ? result : null;
}

async function queryZoningLayer(layerUrl: string, bounds: Bounds, source: "kigali" | "bugesera"): Promise<GeoJsonFeature[]> {
  const result: GeoJsonFeature[] = [];
  const pageSize = 1500;
  for (let offset = 0; offset < 9000; offset += pageSize) {
    const params = new URLSearchParams({
      where: "1=1",
      geometry: bounds.join(","),
      geometryType: "esriGeometryEnvelope",
      inSR: "4326",
      outSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "*",
      returnGeometry: "true",
      resultOffset: String(offset),
      resultRecordCount: String(pageSize),
      f: "geojson"
    });
    const response = await fetch(layerUrl + "/query?" + params.toString(), {
      headers: { Accept: "application/geo+json, application/json" },
      next: { revalidate: 1800 },
      signal: AbortSignal.timeout(15_000)
    });
    if (!response.ok) throw new Error(source + " zoning query failed (" + response.status + ")");
    const payload = await response.json() as GeoJsonCollection;
    if (payload.error) throw new Error(source + " zoning query error " + (payload.error.code ?? "unknown") + ": " + (payload.error.message ?? "query failed"));
    const page = payload.features ?? [];
    result.push(...page);
    if (page.length < pageSize) break;
  }

  return result.flatMap((feature, index) => {
    if (!feature.geometry || !["Polygon", "MultiPolygon"].includes(feature.geometry.type)) return [];
    const properties = feature.properties ?? {};
    const zoneName = [
      properties.new_zoning,
      properties.zoning,
      properties.zone_code,
      properties.gen_lu,
      properties.land_use
    ].find((value) => typeof value === "string" && value.trim().length > 0);
    const zoning = typeof zoneName === "string" ? zoneName.trim() : "Unclassified zoning";
    const id = feature.id ?? properties.objectid ?? properties.OBJECTID ?? properties.fid ?? index;
    return [{
      ...feature,
      id: "zoning-" + source + "-" + String(id),
      properties: {
        ...properties,
        zoning,
        zoning_source: source === "kigali"
          ? "Kigali City Master Plan · Proposed Zoning Plan (22 April 2026 map service)"
          : "National Land Authority / Geodata Rwanda · Bugesera DLUP zoning layer"
      }
    }];
  });
}

export async function GET(request: NextRequest) {
  const bounds = parseBounds(request.nextUrl.searchParams.get("bbox"));
  if (!bounds) {
    return NextResponse.json({ error: "bbox must be west,south,east,north in WGS84 coordinates" }, { status: 400 });
  }

  const jobs = [
    { id: "kigali" as const, url: KIGALI_ZONING_LAYER, extent: KIGALI_EXTENT },
    { id: "bugesera" as const, url: BUGESERA_ZONING_LAYER, extent: BUGESERA_EXTENT }
  ].flatMap((source) => {
    const target = intersect(bounds, source.extent);
    return target ? [{ ...source, target }] : [];
  });

  if (jobs.length === 0) {
    return NextResponse.json({ type: "FeatureCollection", features: [] }, {
      headers: { "Cache-Control": "public, max-age=0, s-maxage=1800, stale-while-revalidate=86400" }
    });
  }

  const responses = await Promise.all(jobs.map(async (source) => {
    try {
      return { source: source.id, features: await queryZoningLayer(source.url, source.target, source.id), failed: false };
    } catch (error) {
      console.error("Official zoning layer failed for " + source.id + ".", error);
      return { source: source.id, features: [] as GeoJsonFeature[], failed: true };
    }
  }));

  if (responses.every((response) => response.failed)) {
    return NextResponse.json({ error: "Official zoning services are temporarily unavailable." }, { status: 502 });
  }

  const features = responses.flatMap((response) => response.features);
  return NextResponse.json({
    type: "FeatureCollection",
    features,
    sources: responses.filter((response) => !response.failed).map((response) => response.source),
    warning: "Zoning is a planning designation, not proof of title or a guarantee of development approval. Check the governing approved plan and current permit conditions."
  }, {
    headers: {
      "Cache-Control": "public, max-age=0, s-maxage=1800, stale-while-revalidate=86400",
      "X-Data-Source": "Kigali City Master Plan; National Land Authority / Geodata Rwanda Bugesera DLUP",
      "X-Zoning-Coverage": "Kigali pilot districts and Bugesera, within published GIS extents"
    }
  });
}
