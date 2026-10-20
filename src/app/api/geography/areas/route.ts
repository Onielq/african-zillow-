import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const FEATURE_SERVER =
  "https://moegis.environment.gov.rw/server/rest/services/Hosted/Administrative_boundaries/FeatureServer";

const INCLUDED_DISTRICTS = ["Gasabo", "Kicukiro", "Nyarugenge", "Bugesera"] as const;
const DISTRICT_WHERE =
  "UPPER(district) IN ('GASABO','KICUKIRO','NYARUGENGE','BUGESERA')";

const RWANDA_BOUNDS = {
  west: 28.7,
  south: -2.95,
  east: 31.05,
  north: -1.0
};

type Level = "district" | "sector";
type Bounds = [number, number, number, number];

type UpstreamFeature = {
  type?: string;
  id?: string | number;
  geometry?: unknown;
  properties?: Record<string, unknown> | null;
};

type UpstreamCollection = {
  type?: string;
  features?: UpstreamFeature[];
  error?: { message?: string };
};

function emptyCollection() {
  return { type: "FeatureCollection" as const, features: [] };
}

function parseBounds(value: string | null): Bounds | null {
  if (!value) return null;

  const numbers = value.split(",").map((part) => Number(part.trim()));
  if (
    numbers.length !== 4 ||
    numbers.some((number) => !Number.isFinite(number))
  ) {
    return null;
  }

  const [rawWest, rawSouth, rawEast, rawNorth] = numbers;
  if (
    rawWest >= rawEast ||
    rawSouth >= rawNorth ||
    rawWest < -180 ||
    rawEast > 180 ||
    rawSouth < -90 ||
    rawNorth > 90
  ) {
    return null;
  }

  const west = Math.max(rawWest, RWANDA_BOUNDS.west);
  const south = Math.max(rawSouth, RWANDA_BOUNDS.south);
  const east = Math.min(rawEast, RWANDA_BOUNDS.east);
  const north = Math.min(rawNorth, RWANDA_BOUNDS.north);

  if (west >= east || south >= north) return null;

  // Round to 3 decimals to avoid requests changing on tiny pan movements.
  return [
    Number(west.toFixed(3)),
    Number(south.toFixed(3)),
    Number(east.toFixed(3)),
    Number(north.toFixed(3))
  ];
}

function textValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
  return null;
}

export async function GET(request: NextRequest) {
  const levelParam = request.nextUrl.searchParams.get("level");
  if (levelParam !== "district" && levelParam !== "sector") {
    return NextResponse.json(
      { error: "level must be district or sector" },
      { status: 400 }
    );
  }

  const bounds = parseBounds(request.nextUrl.searchParams.get("bbox"));
  if (!bounds) {
    // An out-of-country viewport legitimately has no Rwanda features.
    if (request.nextUrl.searchParams.has("bbox")) {
      return NextResponse.json(emptyCollection(), {
        headers: {
          "Cache-Control": "public, max-age=60",
          "X-Data-Source": "Rwanda Environment Ministry GIS"
        }
      });
    }

    return NextResponse.json(
      { error: "bbox must be west,south,east,north in WGS84 coordinates" },
      { status: 400 }
    );
  }

  const layerId = levelParam === "district" ? 0 : 1;
  const fields =
    levelParam === "district"
      ? "province,province_id,district,district_id"
      : "province,province_id,district,district_id,sector,sector_id";

  const upstreamUrl = new URL(`${FEATURE_SERVER}/${layerId}/query`);
  upstreamUrl.search = new URLSearchParams({
    where: DISTRICT_WHERE,
    geometry: bounds.join(","),
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    outSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: fields,
    returnGeometry: "true",
    returnExceededLimitFeatures: "true",
    resultRecordCount: "1000",
    f: "geojson"
  }).toString();

  try {
    const response = await fetch(upstreamUrl, {
      headers: { Accept: "application/geo+json, application/json" },
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(12_000)
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "The administrative boundary source is temporarily unavailable." },
        {
          status: 502,
          headers: { "Cache-Control": "no-store" }
        }
      );
    }

    const payload = (await response.json()) as UpstreamCollection;
    if (payload.error) {
      return NextResponse.json(
        { error: "The administrative boundary source returned an error." },
        {
          status: 502,
          headers: { "Cache-Control": "no-store" }
        }
      );
    }

    const features = (payload.features ?? [])
      .filter((feature) => feature.geometry && feature.properties)
      .map((feature) => {
        const properties = feature.properties ?? {};
        const district = textValue(properties.district);
        const districtId = textValue(properties.district_id);
        const sector = textValue(properties.sector);
        const sectorId = textValue(properties.sector_id);

        return {
          type: "Feature" as const,
          id:
            levelParam === "district"
              ? `district-${districtId ?? district ?? "unknown"}`
              : `sector-${sectorId ?? `${districtId ?? "unknown"}-${sector ?? "unknown"}`}`,
          geometry: feature.geometry,
          properties: {
            province: textValue(properties.province),
            province_id: textValue(properties.province_id),
            district,
            district_id: districtId,
            ...(levelParam === "sector"
              ? { sector, sector_id: sectorId }
              : {})
          }
        };
      })
      .filter((feature) =>
        INCLUDED_DISTRICTS.includes(
          feature.properties.district as (typeof INCLUDED_DISTRICTS)[number]
        )
      );

    return NextResponse.json(
      {
        type: "FeatureCollection",
        features
      },
      {
        headers: {
          "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=1800",
          "X-Data-Source": "Rwanda Environment Ministry GIS",
          "X-Data-Basis": "Layer descriptions reference 2022 census boundaries"
        }
      }
    );
  } catch {
    return NextResponse.json(
      { error: "The administrative boundary source could not be reached." },
      {
        status: 502,
        headers: { "Cache-Control": "no-store" }
      }
    );
  }
}
