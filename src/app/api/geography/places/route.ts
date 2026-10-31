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
      'way["highway"~"motorway|trunk|primary|secondary|tertiary|residential|unclassified|service|living_street|track"](' + box + ');'
    );
    return "[out:json][timeout:12];\n(\n" + selections.join("\n") + "\n);\nout geom tags;";
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
    selections.push(
      'way["highway"~"motorway|trunk|primary|secondary|tertiary|residential|unclassified|service|living_street|track"](' + box + ');'
    );
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

  const output = categories.includes("transportation") ? "out geom tags;" : "out center tags;";
  return "[out:json][timeout:12];\n(\n" + selections.join("\n") + "\n);\n" + output;
}

const overpassCache = new Map<string, { expiresAt: number; elements: OsmElement[] }>();
const overpassInFlight = new Map<string, Promise<OsmElement[]>>();
const OVERPASS_CACHE_MS = 5 * 60 * 1000;
const OVERPASS_CACHE_LIMIT = 48;

async function queryOverpass(query: string): Promise<OsmElement[]> {
  const now = Date.now();
  const cached = overpassCache.get(query);
  if (cached && cached.expiresAt > now) return cached.elements;
  if (cached) overpassCache.delete(query);

  const inFlight = overpassInFlight.get(query);
  if (inFlight) return inFlight;

  const pending = (async () => {
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
          signal: AbortSignal.timeout(14_000)
        });
        if (!response.ok) throw new Error("Overpass returned HTTP " + response.status);
        const payload = await response.json() as OsmResponse;
        if (payload.remark) throw new Error(payload.remark);
        const elements = payload.elements ?? [];
        overpassCache.set(query, { expiresAt: Date.now() + OVERPASS_CACHE_MS, elements });
        while (overpassCache.size > OVERPASS_CACHE_LIMIT) {
          const oldestKey = overpassCache.keys().next().value;
          if (!oldestKey) break;
          overpassCache.delete(oldestKey);
        }
        return elements;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("OpenStreetMap query failed");
  })().finally(() => {
    overpassInFlight.delete(query);
  });
  overpassInFlight.set(query, pending);
  return pending;
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

type PilotDistrictLayer = {
  id: "kigali" | "bugesera";
  url: string;
  districts: readonly string[];
};

const PILOT_DISTRICT_LAYERS: readonly PilotDistrictLayer[] = [
  {
    id: "kigali",
    url: "https://masterplan.kigalicity.gov.rw/server/rest/services/Masterplan2020/Masterplan2020_22Apr2026/MapServer/4",
    districts: ["gasabo", "kicukiro", "nyarugenge"]
  },
  {
    id: "bugesera",
    url: "https://geodata.rw/server/rest/services/Overlays/Bugesera_Masterplan/MapServer/2",
    districts: ["bugesera"]
  }
];

function readDistrictName(properties: Record<string, unknown>): string {
  const candidates = new Set(["district", "districtname", "district1", "distname", "name", "namee"]);
  const entry = Object.entries(properties).find(([key, value]) =>
    candidates.has(key.toLowerCase().replace(/[^a-z0-9]/g, "")) &&
    typeof value === "string" &&
    value.trim().length > 0
  );
  return typeof entry?.[1] === "string" ? entry[1].trim().toLowerCase() : "";
}

async function fetchPilotDistrictLayer(
  source: typeof PILOT_DISTRICT_LAYERS[number]
): Promise<DistrictAreaFeature[]> {
  const params = new URLSearchParams({
    where: "1=1",
    outFields: "*",
    returnGeometry: "true",
    outSR: "4326",
    resultRecordCount: "100",
    f: "geojson"
  });
  const response = await fetch(source.url + "/query?" + params.toString(), {
    headers: { Accept: "application/geo+json, application/json" },
    next: { revalidate: 3600 },
    signal: AbortSignal.timeout(12_000)
  });
  if (!response.ok) {
    throw new Error(source.id + " official district GIS returned HTTP " + response.status);
  }
  const payload = await response.json() as {
    features?: Array<{
      type?: "Feature";
      id?: string | number;
      geometry?: AreaGeometry | null;
      properties?: Record<string, unknown> | null;
    }>;
    error?: { code?: number; message?: string };
  };
  if (payload.error) {
    throw new Error(source.id + " official district GIS error " +
      (payload.error.code ?? "unknown") + ": " + (payload.error.message ?? "query failed"));
  }

  return (payload.features ?? []).flatMap((feature) => {
    const properties = feature.properties ?? {};
    const district = readDistrictName(properties);
    if (!source.districts.includes(district) || !feature.geometry) return [];
    return [{
      type: "Feature" as const,
      geometry: feature.geometry,
      properties: { ...properties, district, source_id: source.id }
    }];
  });
}

async function getPilotDistrictFeatures(): Promise<DistrictAreaFeature[]> {
  if (!pilotDistrictFeaturesPromise) {
    pilotDistrictFeaturesPromise = (async () => {
      // Fetch the official district polygons directly from each GIS publisher.
      // Do not call this Worker’s own /api/geography/areas URL: loopback requests
      // can fail in the deployed Worker runtime even when the browser-facing
      // source-specific area endpoints are healthy.
      const results = await Promise.allSettled(
        PILOT_DISTRICT_LAYERS.map((source) => fetchPilotDistrictLayer(source))
      );
      const features = results.flatMap((result) =>
        result.status === "fulfilled" ? result.value : []
      );
      const failures = results.flatMap((result, index) =>
        result.status === "rejected"
          ? [PILOT_DISTRICT_LAYERS[index].id + ": " +
              (result.reason instanceof Error ? result.reason.message : String(result.reason))]
          : []
      );
      const missing = [...KIGALI_DISTRICT_NAMES, "bugesera"].filter((district) =>
        !features.some((feature) => String(feature.properties?.district ?? "").trim().toLowerCase() === district)
      );
      if (features.length === 0) {
        throw new Error("No official pilot district polygons could be fetched. " + failures.join("; "));
      }
      // A partial boundary set must never become the cached "complete" pilot
      // geography. The current request may still inspect the districts returned,
      // but the next request must retry any missing publisher layer.
      if (missing.length > 0 || failures.length > 0) {
        console.warn("Partial official district clip coverage; will retry missing districts on the next request.", { missing, failures });
        pilotDistrictFeaturesPromise = null;
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
    let allPilotDistricts: DistrictAreaFeature[];
    try {
      allPilotDistricts = await getPilotDistrictFeatures();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error("Pilot district clipping source failed for place overlays.", error);
      return NextResponse.json(
        { error: "Pilot district boundaries could not be loaded for place overlays.", detail },
        {
          status: 502,
          headers: {
            "Cache-Control": "no-store",
            "X-Overlay-Stage": "pilot-district-fetch"
          }
        }
      );
    }
    const allowedDistricts = scope === "kigali"
      ? allPilotDistricts.filter((feature) =>
          KIGALI_DISTRICT_NAMES.has(String(feature.properties?.district ?? "").trim().toLowerCase())
        )
      : scope === "bugesera"
        ? allPilotDistricts.filter((feature) =>
            String(feature.properties?.district ?? "").trim().toLowerCase() === "bugesera"
          )
        : allPilotDistricts;

    // Do not silently return an empty overlay for a viewport whose official
    // clipping boundary failed to load. That was causing place layers in
    // Bugesera/Kigali to look as though they were off until another user action
    // caused a fresh request.
    const requiredDistricts = new Set<string>();
    if (targetBounds.some((target) => intersection(target, KIGALI_EXTENT) !== null)) {
      for (const district of KIGALI_DISTRICT_NAMES) requiredDistricts.add(district);
    }
    if (targetBounds.some((target) => intersection(target, BUGESERA_EXTENT) !== null)) {
      requiredDistricts.add("bugesera");
    }
    const availableDistricts = new Set(allowedDistricts.map((feature) =>
      String(feature.properties?.district ?? "").trim().toLowerCase()
    ));
    const missingForViewport = Array.from(requiredDistricts).filter((district) =>
      !availableDistricts.has(district)
    );
    if (missingForViewport.length > 0) {
      return NextResponse.json(
        {
          error: "Official district boundaries are incomplete for this map view.",
          missingDistricts: missingForViewport
        },
        {
          status: 502,
          headers: {
            "Cache-Control": "no-store",
            "X-Overlay-Stage": "pilot-district-incomplete",
            "X-Overlay-Missing-Districts": missingForViewport.join(",")
          }
        }
      );
    }

    // Keep the place-of-interest query separate from road geometry. A single
    // broad Overpass request containing every tag family and road geometry was
    // failing as a unit on the initial Rwanda-wide view, hiding every category.
    // The lighter groups can now succeed independently.
    const pointOfInterestCategories = categories.filter((category) => category !== "transportation");
    const queryGroups: Array<{ categories: OverlayCategory[] }> = [];
    if (pointOfInterestCategories.length > 0) {
      queryGroups.push({ categories: pointOfInterestCategories });
    }
    if (categories.includes("transportation")) {
      queryGroups.push({ categories: ["transportation"] });
    }

    let successfulQueries = 0;
    let failedQueries = 0;
    const failedCategories = new Set<OverlayCategory>();

    const collections = await Promise.all(targetBounds.map(async (target) => {
      const jobs = queryGroups.map((group) => ({
        categories: group.categories,
        query: queryFor(group.categories, target, false)
      }));
      const results = await Promise.all(jobs.map(async (job) => {
        try {
          const elements = await queryOverpass(job.query);
          successfulQueries += 1;
          return { categories: job.categories, elements };
        } catch (error) {
          failedQueries += 1;
          for (const category of job.categories) failedCategories.add(category);
          console.warn(
            "OpenStreetMap context group failed for " + job.categories.join(", ") + ".",
            error
          );
          return { categories: job.categories, elements: [] as OsmElement[] };
        }
      }));

      return results.flatMap(({ categories: groupCategories, elements }) =>
        elements.flatMap((element) => {
          const tags = element.tags ?? {};
          let actualCategory: OverlayCategory | null = null;
          if (
            groupCategories.includes("transportation") &&
            (typeof tags.highway === "string" || tags.amenity === "bus_station" || tags.amenity === "bus_stop")
          ) actualCategory = "transportation";
          else if (
            groupCategories.includes("healthEducation") &&
            (
              ["school", "university", "college", "hospital", "clinic", "doctors", "pharmacy"].includes(tags.amenity ?? "") ||
              ["hospital", "clinic", "doctor", "pharmacy"].includes(tags.healthcare ?? "")
            )
          ) actualCategory = "healthEducation";
          else if (
            groupCategories.includes("landmarks") &&
            (typeof tags.historic === "string" || ["attraction", "museum", "artwork", "zoo", "viewpoint", "theme_park"].includes(tags.tourism ?? ""))
          ) actualCategory = "landmarks";
          else if (
            groupCategories.includes("nature") &&
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

    if (successfulQueries === 0 && failedQueries > 0) {
      return NextResponse.json(
        {
          error: "OpenStreetMap context is temporarily unavailable.",
          failedCategories: Array.from(failedCategories)
        },
        {
          status: 502,
          headers: {
            "Cache-Control": "no-store",
            "X-Overlay-Stage": "overpass-query",
            "X-Overlay-Failed-Categories": Array.from(failedCategories).join(","),
            "X-Overlay-Failed-Query-Count": String(failedQueries)
          }
        }
      );
    }

    const deduplicated = new Map<string, OverlayFeature>();
    for (const feature of collections.flat()) {
      if (!feature) continue;
      deduplicated.set(String(feature.id), feature);
    }
    const features = Array.from(deduplicated.values())
      .flatMap((feature) => clipFeatureToDistricts(feature, allowedDistricts))
      .slice(0, 6000);
    const partial = failedCategories.size > 0;
    const warning = partial
      ? "Some context layers are temporarily unavailable: " + Array.from(failedCategories).join(", ") + "."
      : null;

    return NextResponse.json(
      {
        type: "FeatureCollection",
        features,
        ...(partial ? { partial: true, warning, failedCategories: Array.from(failedCategories) } : {})
      },
      {
        headers: {
          "Cache-Control": partial
            ? "public, max-age=0, s-maxage=60, stale-while-revalidate=300"
            : "public, max-age=0, s-maxage=300, stale-while-revalidate=900",
          "X-Data-Source": "OpenStreetMap / Overpass API",
          "X-Map-Coverage": scope === "kigali"
            ? "Clipped to official Gasabo, Kicukiro and Nyarugenge district polygons; OSM completeness varies"
            : scope === "bugesera"
              ? "Bugesera pilot extent; source objects may be mapped incompletely"
              : "Kigali and Bugesera pilot extents",
          "X-Feature-Limit": "At most 6000 overlay features are returned for a viewport",
          "X-Attribution": "© OpenStreetMap contributors, ODbL",
          "X-Overlay-Stage": "complete",
          "X-Overlay-Successful-Query-Count": String(successfulQueries),
          "X-Overlay-Failed-Query-Count": String(failedQueries),
          ...(partial ? { "X-Overlay-Partial": "true" } : {})
        }
      }
    );
  } catch (error) {
    console.error("OpenStreetMap overlay query failed.", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        error: "Map overlays are temporarily unavailable. The base map and land boundaries remain available.",
        detail
      },
      {
        status: 502,
        headers: {
          "Cache-Control": "no-store",
          "X-Overlay-Stage": "handler-exception"
        }
      }
    );
  }
}
