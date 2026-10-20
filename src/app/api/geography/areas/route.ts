import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const FEATURE_SERVER =
  "https://moegis.environment.gov.rw/server/rest/services/Hosted/Administrative_boundaries/FeatureServer";

const INCLUDED_DISTRICTS = ["GASABO", "KICUKIRO", "NYARUGENGE", "BUGESERA"] as const;
const DISTRICT_WHERE =
  "UPPER(district) IN ('GASABO','KICUKIRO','NYARUGENGE','BUGESERA')";

const RWANDA_BOUNDS = {
  west: 28.7,
  south: -2.95,
  east: 31.05,
  north: -1.0
};

type Bounds = [number, number, number, number];
type Position2D = [number, number];

type ArcGisGeometry = {
  rings?: unknown;
  type?: string;
  coordinates?: unknown;
  spatialReference?: { wkid?: number; latestWkid?: number };
};

type UpstreamFeature = {
  id?: string | number;
  geometry?: ArcGisGeometry | null;
  properties?: Record<string, unknown> | null;
  attributes?: Record<string, unknown> | null;
};

type UpstreamCollection = {
  features?: UpstreamFeature[];
  error?: { code?: number; message?: string; details?: string[] };
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

function isPosition(value: unknown): value is Position2D {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number" &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  );
}

function closeRing(value: unknown): Position2D[] | null {
  if (!Array.isArray(value)) return null;

  const ring = value.filter(isPosition).map(([x, y]) => [x, y] as Position2D);
  if (ring.length < 3) return null;

  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push([first[0], first[1]]);
  }

  return ring.length >= 4 ? ring : null;
}

function signedRingArea(ring: Position2D[]): number {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const current = ring[i];
    const next = ring[i + 1];
    area += current[0] * next[1] - next[0] * current[1];
  }
  return area / 2;
}

function pointInRing(point: Position2D, ring: Position2D[]): boolean {
  const [x, y] = point;
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];

    const crosses =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi || Number.EPSILON) + xi;

    if (crosses) inside = !inside;
  }

  return inside;
}

function normaliseShell(ring: Position2D[]): Position2D[] {
  return signedRingArea(ring) < 0 ? [...ring].reverse() : ring;
}

function normaliseHole(ring: Position2D[]): Position2D[] {
  return signedRingArea(ring) > 0 ? [...ring].reverse() : ring;
}

function arcGisPolygonToGeoJson(geometry: ArcGisGeometry | null | undefined) {
  if (!geometry) return null;

  if (
    typeof geometry.type === "string" &&
    Array.isArray(geometry.coordinates)
  ) {
    return {
      type: geometry.type,
      coordinates: geometry.coordinates
    };
  }

  if (!Array.isArray(geometry.rings)) return null;

  const rings = geometry.rings
    .map(closeRing)
    .filter((ring): ring is Position2D[] => ring !== null);

  if (rings.length === 0) return null;

  // ArcGIS polygon JSON convention: exterior rings are clockwise and
  // interior rings are counter-clockwise. Convert those rings to GeoJSON.
  let shells = rings.filter((ring) => signedRingArea(ring) < 0);
  let holes = rings.filter((ring) => signedRingArea(ring) > 0);

  // Be defensive if a service emits rings with non-standard orientation.
  if (shells.length === 0) {
    shells = rings;
    holes = [];
  }

  const polygons = shells.map((shell) => ({
    shell: normaliseShell(shell),
    holes: [] as Position2D[][]
  }));

  for (const hole of holes) {
    const sample = hole[0];
    const containing = polygons
      .filter((polygon) => pointInRing(sample, polygon.shell))
      .sort(
        (a, b) =>
          Math.abs(signedRingArea(a.shell)) -
          Math.abs(signedRingArea(b.shell))
      );

    if (containing.length > 0) {
      containing[0].holes.push(normaliseHole(hole));
    }
  }

  const coordinates = polygons.map((polygon) => [
    polygon.shell,
    ...polygon.holes
  ]);

  if (coordinates.length === 1) {
    return {
      type: "Polygon",
      coordinates: coordinates[0]
    };
  }

  return {
    type: "MultiPolygon",
    coordinates
  };
}

export async function GET(request: NextRequest) {
  const levelParam = request.nextUrl.searchParams.get("level");
  if (levelParam !== "district" && levelParam !== "sector") {
    return NextResponse.json(
      { error: "level must be district or sector" },
      { status: 400 }
    );
  }

  const hasBounds = request.nextUrl.searchParams.has("bbox");
  const bounds = parseBounds(request.nextUrl.searchParams.get("bbox"));
  if (!bounds) {
    if (hasBounds) {
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
      ? "objectid,province,province_id,district,district_id"
      : "objectid,province,province_id,district,district_id,sector,sector_id";

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
    resultRecordCount: "1000",
    f: "json"
  }).toString();

  try {
    const response = await fetch(upstreamUrl, {
      headers: { Accept: "application/json" },
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(12_000)
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "The administrative boundary source is temporarily unavailable." },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }

    const payload = (await response.json()) as UpstreamCollection;
    if (payload.error) {
      console.error(
        "Administrative GIS query returned an error.",
        payload.error.code,
        payload.error.message
      );
      return NextResponse.json(
        { error: "The administrative boundary source returned an error." },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }

    const features = (payload.features ?? [])
      .map((feature) => {
        const attributes = feature.properties ?? feature.attributes ?? {};
        const district = textValue(attributes.district);
        const districtId = textValue(attributes.district_id);
        const sector = textValue(attributes.sector);
        const sectorId = textValue(attributes.sector_id);
        const geometry = arcGisPolygonToGeoJson(feature.geometry);

        if (!district || !geometry) return null;

        return {
          type: "Feature" as const,
          id:
            levelParam === "district"
              ? `district-${districtId ?? district}`
              : `sector-${sectorId ?? `${districtId ?? "unknown"}-${sector ?? "unknown"}`}`,
          geometry,
          properties: {
            province: textValue(attributes.province),
            province_id: textValue(attributes.province_id),
            district,
            district_id: districtId,
            ...(levelParam === "sector" ? { sector, sector_id: sectorId } : {})
          }
        };
      })
      .filter((feature): feature is NonNullable<typeof feature> => feature !== null)
      .filter((feature) =>
        INCLUDED_DISTRICTS.includes(
          (feature.properties.district ?? "").toUpperCase() as (typeof INCLUDED_DISTRICTS)[number]
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
  } catch (error) {
    console.error("Administrative boundary fetch failed.", error);
    return NextResponse.json(
      { error: "The administrative boundary source could not be reached." },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}
