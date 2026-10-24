import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const revalidate = 300;

type OverlayCategory = "landmarks" | "healthEducation" | "transportation" | "nature";
type Bounds = [number, number, number, number];
type OsmTags = Record<string, string | undefined>;
type OsmElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  geometry?: Array<{ lat?: number; lon?: number }>;
  tags?: OsmTags;
};
type OsmResponse = { elements?: OsmElement[]; remark?: string };
type AreaGeometry = { type: string; coordinates: unknown };
type DistrictAreaFeature = {
  type: "Feature";
  geometry: AreaGeometry | null;
  properties: Record<string, unknown>;
};
type OverlayFeature = {
  type: "Feature";
  id: string;
  geometry:
    | { type: "Point"; coordinates: [number, number] }
    | { type: "LineString"; coordinates: [number, number][] }
    | { type: "MultiLineString"; coordinates: [number, number][][] };
  properties: {
    overlay_category: OverlayCategory;
    name: string;
    detail: string;
    source_id: string;
    source_label: string;
  };
};

const KIGALI_EXTENT: Bounds = [29.58, -2.12, 30.32, -1.47];
const BUGESERA_EXTENT: Bounds = [29.82, -2.62, 30.56, -1.92];
const PILOT_DISTRICT_BOUNDS: Bounds = [29.4, -2.75, 30.7, -1.4];
const KIGALI_DISTRICT_NAMES = new Set(["gasabo", "kicukiro", "nyarugenge"]);
const PILOT_DISTRICT_NAMES = new Set(["gasabo", "kicukiro", "nyarugenge", "bugesera"]);
let pilotDistrictFeaturesPromise: Promise<DistrictAreaFeature[]> | null = null;
const VALID_CATEGORIES: OverlayCategory[] = [
  "landmarks",
  "healthEducation",
  "transportation",
  "nature"
];
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter"
];

function parseBounds(value: string | null): Bounds | null {
  if (!value) return null;
  const values = value.split(",").map((part) => Number(part.trim()));
  if (values.length !== 4 || !values.every(Number.isFinite)) return null;
  const [west, south, east, north] = values;
  if (west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north) return null;
  return [west, south, east, north];
}

function intersection(a: Bounds, b: Bounds): Bounds | null {
  const result: Bounds = [
    Math.max(a[0], b[0]),
    Math.max(a[1], b[1]),
    Math.min(a[2], b[2]),
    Math.min(a[3], b[3])
  ];
  return result[0] < result[2] && result[1] < result[3] ? result : null;
}

function queryFor(categories: OverlayCategory[], bounds: Bounds, roadsOnly: boolean): string {
  const [west, south, east, north] = bounds;
  const box = [south, west, north, east].join(",");
  const selections: string[] = [];

  if (roadsOnly) {
    selections.push(
      'way["highway"~"motorway|trunk|primary|secondary|tertiary"](' + box + ');'
    );
    return "[out:json][timeout:22];\n(\n" + selections.join("\n") + "\n);\nout geom tags;";
  }

  if (categories.includes("landmarks")) {
    for (const element of ["node", "way", "relation"]) {
      selections.push(
        element + '["tourism"~"attraction|museum|artwork|zoo|viewpoint|theme_park"](' + box + ");"
      );
      selections.push(element + '["historic"](' + box + ");");
    }
  }

  if (categories.includes("healthEducation")) {
    for (const element of ["node", "way", "relation"]) {
      selections.push(
        element + '["amenity"~"school|university|college|hospital|clinic|doctors|pharmacy"](' + box + ");"
      );
      selections.push(
        element + '["healthcare"~"hospital|clinic|doctor|pharmacy"](' + box + ");"
      );
    }
  }

  if (categories.includes("transportation")) {
    selections.push('node["highway"="bus_stop"](' + box + ");");
    selections.push('node["amenity"~"bus_station|bus_stop"](' + box + ");");
    selections.push('way["amenity"="bus_station"](' + box + ");");
    selections.push('relation["amenity"="bus_station"](' + box + ");");
  }

  if (categories.includes("nature")) {
    for (const element of ["node", "way", "relation"]) {
      selections.push(element + '["leisure"~"park|nature_reserve"](' + box + ");");
      selections.push(element + '["natural"~"water|waterfall"](' + box + ");");
      selections.push(element + '["water"="lake"](' + box + ");");
      selections.push(element + '["waterway"="waterfall"](' + box + ");");
      selections.push(element + '["boundary"="protected_area"](' + box + ");");
    }
  }

  return "[out:json][timeout:22];\n(\n" + selections.join("\n") + "\n);\nout center tags;";
}

async function queryOverpass(query: string): Promise<OsmElement[]> {
  let lastError: unknown;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          "Accept": "application/json",
          "User-Agent": "Rwanda Land Intelligence map overlay"
        },
        body: new URLSearchParams({ data: query }).toString(),
        signal: AbortSignal.timeout(24000),
        next: { revalidate: 300 }
      });
      if (!response.ok) throw new Error("Overpass returned HTTP " + response.status);
      const payload = await response.json() as OsmResponse;
      if (payload.remark) throw new Error(payload.remark);
      return payload.elements ?? [];
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("OpenStreetMap query failed");
}

function featureForElement(element: OsmElement, category: OverlayCategory): OverlayFeature | null {
  const tags = element.tags ?? {};
  const isRoad =
    category === "transportation" &&
    typeof tags.highway === "string" &&
    Array.isArray(element.geometry) &&
    element.geometry.length >= 2;
  let geometry: OverlayFeature["geometry"] | null = null;

  if (isRoad) {
    const coordinates = (element.geometry ?? [])
      .filter((point): point is { lat: number; lon: number } =>
        typeof point.lat === "number" && typeof point.lon === "number"
      )
      .map((point) => [point.lon, point.lat] as [number, number]);
    if (coordinates.length >= 2) geometry = { type: "LineString", coordinates };
  } else {
    const lat = element.type === "node" ? element.lat : element.center?.lat;
    const lon = element.type === "node" ? element.lon : element.center?.lon;
    if (typeof lat === "number" && typeof lon === "number") {
      geometry = { type: "Point", coordinates: [lon, lat] };
    }
  }

  if (!geometry) return null;
  const rawName = tags.name ?? tags["name:en"] ?? tags.operator ?? null;
  const categoryLabel =
    category === "landmarks" ? "Landmark" :
    category === "healthEducation" ? (tags.amenity === "school" || tags.amenity === "university" ? "School" : "Medical facility") :
    category === "transportation" ? (isRoad ? "Road" : "Bus stop / station") :
    "Nature feature";
  const name = rawName || categoryLabel;
  const detail = [
    tags.amenity,
    tags.tourism,
    tags.historic,
    tags.leisure,
    tags.natural,
    tags.water,
    tags.waterway,
    tags.healthcare,
    tags.highway
  ].filter(Boolean).join(" · ");

  return {
    type: "Feature" as const,
    id: "osm-" + element.type + "-" + element.id,
    geometry,
    properties: {
      overlay_category: category,
      name,
      detail,
      source_id: element.type + "/" + element.id,
      source_label: "OpenStreetMap contributors · data may be incomplete"
    }
  };
}

function pointInRing(point: [number, number], rawRing: unknown): boolean {
  if (!Array.isArray(rawRing) || rawRing.length < 4) return false;
  const ring = rawRing.filter((value): value is [number, number] =>
    Array.isArray(value) && typeof value[0] === "number" && typeof value[1] === "number"
  );
  if (ring.length < 4) return false;
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = (yi > y) !== (yj > y) &&
      x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInPolygon(point: [number, number], rawPolygon: unknown): boolean {
  if (!Array.isArray(rawPolygon) || !rawPolygon.length) return false;
  if (!pointInRing(point, rawPolygon[0])) return false;
  return !rawPolygon.slice(1).some((hole) => pointInRing(point, hole));
}

function pointInDistrictAreas(point: [number, number], areas: DistrictAreaFeature[]): boolean {
  return areas.some((feature) => {
    const geometry = feature.geometry;
    if (!geometry) return false;
    if (geometry.type === "Polygon") return pointInPolygon(point, geometry.coordinates);
    if (geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates)) {
      return geometry.coordinates.some((polygon) => pointInPolygon(point, polygon));
    }
    return false;
  });
}

async function getPilotDistrictFeatures(request: NextRequest): Promise<DistrictAreaFeature[]> {
  if (!pilotDistrictFeaturesPromise) {
    pilotDistrictFeaturesPromise = (async () => {
      const url = new URL("/api/geography/areas", request.url);
      url.searchParams.set("level", "district");
      url.searchParams.set("bbox", PILOT_DISTRICT_BOUNDS.join(","));
      const response = await fetch(url, {
        headers: { Accept: "application/geo+json, application/json" },
        next: { revalidate: 300 },
        signal: AbortSignal.timeout(30000)
      });
      if (!response.ok) throw new Error("Pilot district boundary query returned HTTP " + response.status);
      const payload = await response.json() as { features?: DistrictAreaFeature[] };
      const features = (payload.features ?? []).filter((feature) => {
        const district = String(feature.properties?.district ?? "").trim().toLowerCase();
        return PILOT_DISTRICT_NAMES.has(district) && feature.geometry !== null;
      });
      if (![...KIGALI_DISTRICT_NAMES, "bugesera"].every((district) =>
        features.some((feature) => String(feature.properties?.district ?? "").trim().toLowerCase() === district)
      )) {
        throw new Error("One or more pilot district boundaries are missing; map overlays will fail closed.");
      }
      return features;
    })().catch((error) => {
      pilotDistrictFeaturesPromise = null;
      throw error;
    });
  }
  return pilotDistrictFeaturesPromise;
}

function clipLineToDistricts(
  coordinates: [number, number][],
  areas: DistrictAreaFeature[]
): [number, number][][] {
  const segments: [number, number][][] = [];
  let current: [number, number][] = [];
  const flush = () => {
    if (current.length >= 2) segments.push(current);
    current = [];
  };
  for (const coordinate of coordinates) {
    if (pointInDistrictAreas(coordinate, areas)) {
      current.push(coordinate);
    } else {
      flush();
    }
  }
  flush();
  return segments;
}

function clipFeatureToDistricts(
  feature: OverlayFeature,
  areas: DistrictAreaFeature[]
): OverlayFeature[] {
  if (feature.geometry.type === "Point") {
    return pointInDistrictAreas(feature.geometry.coordinates, areas) ? [feature] : [];
  }
  const lines = feature.geometry.type === "LineString"
    ? [feature.geometry.coordinates]
    : feature.geometry.coordinates;
  const clipped = lines.flatMap((line) => clipLineToDistricts(line, areas));
  if (!clipped.length) return [];
  return [{
    ...feature,
    geometry: clipped.length === 1
      ? { type: "LineString", coordinates: clipped[0] }
      : { type: "MultiLineString", coordinates: clipped }
  }];
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const bounds = parseBounds(params.get("bbox"));
  if (!bounds) {
    return NextResponse.json(
      { error: "bbox must be west,south,east,north in WGS84 coordinates" },
      { status: 400 }
    );
  }

  const requested = (params.get("categories") ?? "")
    .split(",")
    .map((category) => category.trim())
    .filter((category): category is OverlayCategory =>
      VALID_CATEGORIES.includes(category as OverlayCategory)
    );
  const categories = Array.from(new Set(requested));
  if (categories.length === 0) {
    return NextResponse.json({ type: "FeatureCollection", features: [] });
  }

  const scope = params.get("scope") ?? "pilot";
  const scopedBounds = scope === "kigali"
    ? [KIGALI_EXTENT]
    : scope === "bugesera"
      ? [BUGESERA_EXTENT]
      : [KIGALI_EXTENT, BUGESERA_EXTENT];
  const targetBounds = scopedBounds
    .map((extent) => intersection(bounds, extent))
    .filter((value): value is Bounds => value !== null);

  if (targetBounds.length === 0) {
    return NextResponse.json(
      { type: "FeatureCollection", features: [] },
      { headers: { "Cache-Control": "public, max-age=0, s-maxage=300" } }
    );
  }

  try {
    // Always clip context layers against the official pilot district polygons.
    // Bounding boxes are only query optimizations; they do not define the city limits.
    const allPilotDistricts = await getPilotDistrictFeatures(request);
    const allowedDistricts = scope === "kigali"
      ? allPilotDistricts.filter((feature) =>
          KIGALI_DISTRICT_NAMES.has(String(feature.properties?.district ?? "").trim().toLowerCase())
        )
      : scope === "bugesera"
        ? allPilotDistricts.filter((feature) =>
            String(feature.properties?.district ?? "").trim().toLowerCase() === "bugesera"
          )
        : allPilotDistricts;

    const collections = await Promise.all(targetBounds.map(async (target) => {
      const jobs: Array<Promise<OsmElement[]>> = [
        queryOverpass(queryFor(categories, target, false))
      ];
      if (categories.includes("transportation")) {
        jobs.push(queryOverpass(queryFor(categories, target, true)));
      }
      const results = await Promise.all(jobs);
      return results.flatMap((elements) =>
        elements.flatMap((element) => {
          const tags = element.tags ?? {};
          let actualCategory: OverlayCategory | null = null;
          if (
            categories.includes("transportation") &&
            (typeof tags.highway === "string" || tags.amenity === "bus_station" || tags.amenity === "bus_stop")
          ) actualCategory = "transportation";
          else if (
            categories.includes("healthEducation") &&
            ["school", "university", "college", "hospital", "clinic", "doctors", "pharmacy"].includes(tags.amenity ?? "") ||
            ["hospital", "clinic", "doctor", "pharmacy"].includes(tags.healthcare ?? "")
          ) actualCategory = "healthEducation";
          else if (
            categories.includes("landmarks") &&
            (typeof tags.historic === "string" || ["attraction", "museum", "artwork", "zoo", "viewpoint", "theme_park"].includes(tags.tourism ?? ""))
          ) actualCategory = "landmarks";
          else if (
            categories.includes("nature") &&
            (["park", "nature_reserve"].includes(tags.leisure ?? "") ||
              ["water", "waterfall"].includes(tags.natural ?? "") ||
              tags.water === "lake" || tags.waterway === "waterfall" || tags.boundary === "protected_area")
          ) actualCategory = "nature";
          if (!actualCategory) return [];
          const feature = featureForElement(element, actualCategory);
          return feature ? [feature] : [];
        })
      );
    }));

    const deduplicated = new Map<string, OverlayFeature>();
    for (const feature of collections.flat()) {
      if (!feature) continue;
      deduplicated.set(String(feature.id), feature);
    }
    const features = Array.from(deduplicated.values())
      .flatMap((feature) => clipFeatureToDistricts(feature, allowedDistricts))
      .slice(0, 6000);

    return NextResponse.json(
      { type: "FeatureCollection", features },
      {
        headers: {
          "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=900",
          "X-Data-Source": "OpenStreetMap / Overpass API",
          "X-Map-Coverage": scope === "kigali"
            ? "Clipped to official Gasabo, Kicukiro and Nyarugenge district polygons; OSM completeness varies"
            : scope === "bugesera"
              ? "Bugesera pilot extent; source objects may be mapped incompletely"
              : "Kigali and Bugesera pilot extents",
          "X-Feature-Limit": "At most 6000 overlay features are returned for a viewport",
          "X-Attribution": "© OpenStreetMap contributors, ODbL"
        }
      }
    );
  } catch (error) {
    console.error("OpenStreetMap overlay query failed.", error);
    return NextResponse.json(
      { error: "Map overlays are temporarily unavailable. The base map and land boundaries remain available." },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}
