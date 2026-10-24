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

const KIGALI_EXTENT: Bounds = [29.58, -2.12, 30.32, -1.47];
const BUGESERA_EXTENT: Bounds = [29.82, -2.62, 30.56, -1.92];
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

function intersects(a: Bounds, b: Bounds): boolean {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
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

function featureForElement(element: OsmElement, category: OverlayCategory) {
  const tags = element.tags ?? {};
  const isRoad =
    category === "transportation" &&
    typeof tags.highway === "string" &&
    Array.isArray(element.geometry) &&
    element.geometry.length >= 2;
  let geometry: { type: "Point"; coordinates: [number, number] } | {
    type: "LineString";
    coordinates: [number, number][];
  } | null = null;

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
    const collections = await Promise.all(targetBounds.map(async (target) => {
      const jobs: Array<Promise<{ category: OverlayCategory; elements: OsmElement[] }>> = [
        queryOverpass(queryFor(categories, target, false)).then((elements) => ({
          category: "landmarks" as OverlayCategory,
          elements
        }))
      ];
      if (categories.includes("transportation")) {
        jobs.push(
          queryOverpass(queryFor(categories, target, true)).then((elements) => ({
            category: "transportation" as OverlayCategory,
            elements
          }))
        );
      }
      const results = await Promise.all(jobs);
      return results.flatMap(({ category: _category, elements }) =>
        elements.flatMap((element) => {
          const tags = element.tags ?? {};
          let actualCategory: OverlayCategory | null = null;
          if (
            categories.includes("transportation") &&
            (typeof tags.highway === "string" || tags.amenity === "bus_station" || tags.amenity === "bus_stop")
          ) actualCategory = "transportation";
          else if (
            categories.includes("healthEducation") &&
            ["school", "university", "college", "hospital", "clinic", "doctors", "pharmacy"].includes(tags.amenity ?? "")
          ) actualCategory = "healthEducation";
          else if (
            categories.includes("landmarks") &&
            (typeof tags.historic === "string" || ["attraction", "museum", "artwork", "zoo", "viewpoint", "theme_park"].includes(tags.tourism ?? ""))
          ) actualCategory = "landmarks";
          else if (
            categories.includes("nature") &&
            (["park", "nature_reserve"].includes(tags.leisure ?? "") ||
              ["water", "waterfall"].includes(tags.natural ?? "") ||
              tags.water === "lake" || tags.boundary === "protected_area")
          ) actualCategory = "nature";
          if (!actualCategory) return [];
          const feature = featureForElement(element, actualCategory);
          return feature ? [feature] : [];
        })
      );
    }));

    const deduplicated = new Map<string, ReturnType<typeof featureForElement>>();
    for (const feature of collections.flat()) {
      if (!feature) continue;
      deduplicated.set(String(feature.id), feature);
    }
    const features = Array.from(deduplicated.values()).filter(Boolean).slice(0, 6000);

    return NextResponse.json(
      { type: "FeatureCollection", features },
      {
        headers: {
          "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=900",
          "X-Data-Source": "OpenStreetMap / Overpass API",
          "X-Map-Coverage": scope === "kigali"
            ? "Kigali City pilot extent; source objects may be mapped incompletely"
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
