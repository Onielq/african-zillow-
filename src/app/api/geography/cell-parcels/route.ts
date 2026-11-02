import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const revalidate = 300;

const KIGALI_PARCELS =
  "https://masterplan.kigalicity.gov.rw/server/rest/services/Hosted/Kigali_Parcels_1June2026_for_search/FeatureServer/0";
const BUGESERA_PARCELS =
  "https://services7.arcgis.com/htgaiKX6RV2DDGgK/arcgis/rest/services/Bugesera_Parcels/FeatureServer/0";
const ALLOWED_DISTRICTS = new Set(["gasabo", "kicukiro", "nyarugenge", "bugesera"]);
const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 250;

type ArcGisFeature = {
  attributes?: Record<string, unknown>;
  geometry?: {
    rings?: unknown;
    paths?: unknown;
    x?: unknown;
    y?: unknown;
  };
};
type ArcGisResponse = {
  objectIds?: Array<number | string>;
  features?: ArcGisFeature[];
  error?: { code?: number; message?: string };
};

function clean(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

function attributeValue(attributes: Record<string, unknown>, name: string): unknown {
  const wanted = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const match = Object.entries(attributes).find(
    ([key]) => key.toLowerCase().replace(/[^a-z0-9]/g, "") === wanted
  );
  return match?.[1] ?? null;
}

function textValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function numericValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function coordinatesBounds(value: unknown): [number, number, number, number] | null {
  const positions: Array<[number, number]> = [];
  const visit = (candidate: unknown) => {
    if (!Array.isArray(candidate)) return;
    if (
      candidate.length >= 2 &&
      typeof candidate[0] === "number" &&
      typeof candidate[1] === "number"
    ) {
      positions.push([candidate[0], candidate[1]]);
      return;
    }
    for (const child of candidate) visit(child);
  };
  visit(value);
  if (!positions.length) return null;
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const [x, y] of positions) {
    west = Math.min(west, x);
    south = Math.min(south, y);
    east = Math.max(east, x);
    north = Math.max(north, y);
  }
  return [west, south, east, north].every(Number.isFinite)
    ? [west, south, east, north]
    : null;
}

function parcelBounds(feature: ArcGisFeature): [number, number, number, number] | null {
  const geometry = feature.geometry;
  return coordinatesBounds(geometry?.rings ?? geometry?.paths ?? []);
}

async function requestArcGis(
  layerUrl: string,
  parameters: Record<string, string>
): Promise<ArcGisResponse> {
  const url = new URL(layerUrl + "/query");
  url.search = new URLSearchParams({ ...parameters, f: "json" }).toString();
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: 300 },
    signal: AbortSignal.timeout(25000)
  });
  if (!response.ok) throw new Error("Parcel source returned HTTP " + response.status);
  const payload = await response.json() as ArcGisResponse;
  if (payload.error) {
    throw new Error("ArcGIS " + (payload.error.code ?? "error") + ": " + (payload.error.message ?? "query failed"));
  }
  return payload;
}

function compareObjectIds(a: number | string, b: number | string): number {
  const numericA = Number(a);
  const numericB = Number(b);
  if (Number.isFinite(numericA) && Number.isFinite(numericB)) return numericA - numericB;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const params = request.nextUrl.searchParams;
  const district = clean(params.get("district"));
  const sector = clean(params.get("sector"));
  const cell = clean(params.get("cell"));
  if (!district || !sector || !cell || !ALLOWED_DISTRICTS.has(district.toLowerCase())) {
    return NextResponse.json(
      { error: "district, sector, and cell are required; only the four pilot districts are supported." },
      { status: 400 }
    );
  }

  const requestedPage = Number.parseInt(params.get("page") ?? "1", 10);
  const requestedPageSize = Number.parseInt(params.get("pageSize") ?? String(DEFAULT_PAGE_SIZE), 10);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const pageSize = Number.isFinite(requestedPageSize)
    ? Math.min(MAX_PAGE_SIZE, Math.max(1, requestedPageSize))
    : DEFAULT_PAGE_SIZE;

  const layerUrl = district.toLowerCase() === "bugesera" ? BUGESERA_PARCELS : KIGALI_PARCELS;
  // Match the same case-insensitive geography used by map search.
  const where = [
    "UPPER(district) = '" + escapeSql(district.toLocaleUpperCase("en")) + "'",
    "UPPER(sector) = '" + escapeSql(sector.toLocaleUpperCase("en")) + "'",
    "UPPER(cell) = '" + escapeSql(cell.toLocaleUpperCase("en")) + "'",
    "upi IS NOT NULL"
  ].join(" AND ");

  // Request only the fields shown in the parcel list. One page requests
  // geometry for at most 250 object IDs, never a full cell in serial batches.
  const outFields = "upi,district,sector,cell,village,parcel_number,size,area_in_wetland,last_updated_on";

  try {
    const idPayload = await requestArcGis(layerUrl, {
      where,
      returnIdsOnly: "true",
      returnGeometry: "false"
    });
    const ids = [...(idPayload.objectIds ?? [])].sort(compareObjectIds);
    const start = (page - 1) * pageSize;
    const selectedIds = ids.slice(start, start + pageSize);
    const featurePayload = selectedIds.length
      ? await requestArcGis(layerUrl, {
          objectIds: selectedIds.join(","),
          outFields,
          returnGeometry: "true",
          outSR: "4326"
        })
      : { features: [] as ArcGisFeature[] };

    const parcels = (featurePayload.features ?? []).flatMap((feature) => {
      const attributes = feature.attributes ?? {};
      const upi = textValue(attributeValue(attributes, "upi"));
      const actualDistrict = textValue(attributeValue(attributes, "district"));
      const actualSector = textValue(attributeValue(attributes, "sector"));
      const actualCell = textValue(attributeValue(attributes, "cell"));
      const bounds = parcelBounds(feature);
      if (!upi || !bounds || !actualDistrict || !actualSector || !actualCell) return [];

      // Re-check the exact geography so adjacent plots cannot leak through.
      const normalise = (value: string) =>
        value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLowerCase();
      if (
        normalise(actualDistrict) !== normalise(district) ||
        normalise(actualSector) !== normalise(sector) ||
        normalise(actualCell) !== normalise(cell)
      ) return [];

      return [{
        id: upi,
        upi,
        parcelNumber: textValue(attributeValue(attributes, "parcel_number")),
        district: actualDistrict,
        sector: actualSector,
        cell: actualCell,
        village: textValue(attributeValue(attributes, "village")),
        areaM2: numericValue(attributeValue(attributes, "size")),
        wetlandAreaM2: numericValue(attributeValue(attributes, "area_in_wetland")),
        lastUpdatedOn: numericValue(attributeValue(attributes, "last_updated_on")),
        bounds
      }];
    }).sort((a, b) =>
      (a.parcelNumber ?? a.upi).localeCompare(b.parcelNumber ?? b.upi, undefined, { numeric: true })
    );

    const hasMore = start + selectedIds.length < ids.length;
    return NextResponse.json(
      {
        district,
        sector,
        cell,
        page,
        pageSize,
        nextPage: hasMore ? page + 1 : null,
        hasMore,
        totalSourceRecords: ids.length,
        returnedRecords: parcels.length,
        parcels
      },
      {
        headers: {
          "Cache-Control": "public, max-age=0, s-maxage=180, stale-while-revalidate=900",
          "Server-Timing": "cell-parcels;dur=" + (Date.now() - startedAt),
          "X-Cell-Parcel-Page": String(page),
          "X-Cell-Parcel-Page-Size": String(pageSize),
          "X-Data-Source": district.toLowerCase() === "bugesera"
            ? "National Land Authority LAIS Bugesera_Parcels FeatureServer"
            : "City of Kigali Master Plan Kigali Parcels FeatureServer",
          "X-Parcel-List-Basis": "Paginated cadastral records with stable UPI; not proof of legal ownership"
        }
      }
    );
  } catch (error) {
    console.error("Cell parcel list query failed.", error);
    return NextResponse.json(
      { error: "The parcel list is temporarily unavailable for this cell." },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}
