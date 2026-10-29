import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const revalidate = 60;

type OsmElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  geometry?: Array<{ lat: number; lon: number }>;
  tags?: Record<string, string | undefined>;
};
type OsmResponse = { elements?: OsmElement[]; remark?: string };
type NearbyCategory = "Main road" | "School" | "Clinic / hospital" | "Public transport" | "Landmark" | "Village office";
type NearbyAmenityCategory = Exclude<NearbyCategory, "Main road">;
type Candidate = { id: string; name: string; category: NearbyAmenityCategory; lat: number; lon: number; straightKm: number };
type RouteResult = { id: string; category: NearbyCategory; name: string; distanceKm: number | null; timeMinutes: number | null; routeStatus: "routed" | "straight-line" | "unavailable" };
type ValhallaResponse = {
  trip?: { status?: number; status_message?: string; summary?: { length?: number; time?: number }; legs?: Array<{ summary?: { length?: number; time?: number } }> };
  error?: string;
  error_code?: number;
};

const RWANDA = { west: 28.7, east: 31.05, south: -2.95, north: -1.0 };
const OVERPASS_ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
const VALHALLA_BASE_RAW = process.env.VALHALLA_ROUTING_URL?.trim() || "https://valhalla1.openstreetmap.de";
const VALHALLA_BASE = VALHALLA_BASE_RAW.endsWith("/") ? VALHALLA_BASE_RAW.slice(0, -1) : VALHALLA_BASE_RAW;
const CACHE_MS = 5 * 60 * 1000;
const responseCache = new Map<string, { expiresAt: number; value: { items: RouteResult[]; note: string } }>();
const inFlight = new Map<string, Promise<{ items: RouteResult[]; note: string }>>();

function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const toRad = (degrees: number) => degrees * Math.PI / 180;
  const latDelta = toRad(bLat - aLat);
  const lonDelta = toRad(bLon - aLon);
  const term = Math.sin(latDelta / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(lonDelta / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, term)));
}

function classify(tags: Record<string, string | undefined>): NearbyAmenityCategory | null {
  const amenity = (tags.amenity ?? "").toLowerCase();
  const healthcare = (tags.healthcare ?? "").toLowerCase();
  const office = (tags.office ?? "").toLowerCase();
  const government = (tags.government ?? "").toLowerCase();
  const tourism = (tags.tourism ?? "").toLowerCase();
  const leisure = (tags.leisure ?? "").toLowerCase();
  const natural = (tags.natural ?? "").toLowerCase();
  const waterway = (tags.waterway ?? "").toLowerCase();
  const historic = (tags.historic ?? "").toLowerCase();

  if (["school", "university", "college", "kindergarten"].includes(amenity)) return "School";
  if (["hospital", "clinic", "doctors", "pharmacy"].includes(amenity) ||
      ["hospital", "clinic", "doctor", "pharmacy"].includes(healthcare)) return "Clinic / hospital";
  if (tags.highway === "bus_stop" || ["bus_stop", "bus_station"].includes(amenity)) return "Public transport";
  if (amenity === "townhall" || ["government", "administrative"].includes(office) ||
      government === "administrative") return "Village office";
  if (["attraction", "viewpoint", "museum", "zoo", "theme_park"].includes(tourism) ||
      ["park", "nature_reserve"].includes(leisure) ||
      ["lake", "peak", "waterfall", "spring"].includes(natural) ||
      ["river", "waterfall"].includes(waterway) ||
      ["monument", "memorial", "castle", "ruins"].includes(historic)) return "Landmark";
  return null;
}

function categoryName(category: NearbyAmenityCategory): string {
  switch (category) {
    case "School": return "Unnamed school";
    case "Clinic / hospital": return "Unnamed medical facility";
    case "Public transport": return "Unnamed transport stop";
    case "Landmark": return "Unnamed landmark";
    case "Village office": return "Unnamed local office";
  }
}

function buildQuery(south: number, west: number, north: number, east: number): string {
  const box = [south, west, north, east].map((value) => value.toFixed(6)).join(",");
  return [
    "[out:json][timeout:8];", "(",
    'nwr["amenity"~"school|university|college|kindergarten|hospital|clinic|doctors|pharmacy|bus_station|bus_stop|townhall"](' + box + ");",
    'nwr["healthcare"~"hospital|clinic|doctor|pharmacy"](' + box + ");",
    'nwr["office"~"government|administrative"](' + box + ");",
    'nwr["government"="administrative"](' + box + ");",
    'nwr["tourism"~"attraction|viewpoint|museum|zoo|theme_park"](' + box + ");",
    'nwr["leisure"~"park|nature_reserve"](' + box + ");",
    'nwr["natural"~"lake|peak|waterfall|spring"](' + box + ");",
    'nwr["waterway"~"river|waterfall"](' + box + ");",
    'nwr["historic"~"monument|memorial|castle|ruins"](' + box + ");",
    'node["highway"="bus_stop"](' + box + ");",
    ");", "out center tags;"
  ].join("\n");
}

function buildRoadQuery(south: number, west: number, north: number, east: number): string {
  const box = [south, west, north, east].map((value) => value.toFixed(6)).join(",");
  return [
    "[out:json][timeout:8];",
    'way["highway"~"^(trunk|primary|secondary|tertiary)$"](' + box + ");",
    "out geom tags;"
  ].join("\n");
}

function distanceToRoadSegmentKm(
  origin: { lat: number; lon: number },
  a: { lat: number; lon: number },
  b: { lat: number; lon: number }
): number {
  // A local equirectangular projection is accurate enough over this short
  // distance, and avoids confusing straight-line proximity with a road route.
  const radians = origin.lat * Math.PI / 180;
  const metersPerDegreeLatitude = 111_320;
  const metersPerDegreeLongitude = 111_320 * Math.cos(radians);
  const ax = (a.lon - origin.lon) * metersPerDegreeLongitude;
  const ay = (a.lat - origin.lat) * metersPerDegreeLatitude;
  const bx = (b.lon - origin.lon) * metersPerDegreeLongitude;
  const by = (b.lat - origin.lat) * metersPerDegreeLatitude;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared));
  const nearestX = ax + t * dx;
  const nearestY = ay + t * dy;
  return Math.sqrt(nearestX * nearestX + nearestY * nearestY) / 1000;
}

async function getOsmElements(query: string): Promise<OsmElement[]> {
  let lastError: unknown;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          Accept: "application/json",
          "User-Agent": "Rwanda Land Intelligence nearby-access"
        },
        body: new URLSearchParams({ data: query }).toString(),
        signal: AbortSignal.timeout(8500)
      });
      if (!response.ok) throw new Error("Overpass returned HTTP " + response.status);
      const payload = await response.json() as OsmResponse;
      if (payload.remark) throw new Error(payload.remark);
      return payload.elements ?? [];
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("OpenStreetMap amenity query failed");
}

async function getRoadRoute(origin: { lat: number; lon: number }, destination: Candidate): Promise<RouteResult> {
  try {
    const response = await fetch(VALHALLA_BASE + "/route", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        locations: [{ lat: origin.lat, lon: origin.lon }, { lat: destination.lat, lon: destination.lon }],
        costing: "auto",
        units: "kilometers",
        language: "en",
        directions_type: "none"
      }),
      signal: AbortSignal.timeout(7500)
    });
    if (!response.ok) throw new Error("Valhalla returned HTTP " + response.status);
    const payload = await response.json() as ValhallaResponse;
    if (!payload.trip || payload.trip.status !== 0) throw new Error(payload.trip?.status_message ?? payload.error ?? "No road route found");
    const summary = payload.trip.summary ?? payload.trip.legs?.[0]?.summary;
    const distanceKm = Number(summary?.length);
    const timeSeconds = Number(summary?.time);
    if (!Number.isFinite(distanceKm) || distanceKm < 0 || !Number.isFinite(timeSeconds) || timeSeconds < 0) {
      throw new Error("Valhalla returned no route summary");
    }
    return {
      id: destination.id, category: destination.category, name: destination.name,
      distanceKm: Math.round(distanceKm * 100) / 100,
      timeMinutes: Math.max(0, Math.round(timeSeconds / 60)),
      routeStatus: "routed"
    };
  } catch {
    return { id: destination.id, category: destination.category, name: destination.name, distanceKm: null, timeMinutes: null, routeStatus: "unavailable" };
  }
}

async function calculateNearbyRoutes(lat: number, lon: number): Promise<{ items: RouteResult[]; note: string }> {
  const radius = 0.05;
  const query = buildQuery(
    Math.max(RWANDA.south, lat - radius),
    Math.max(RWANDA.west, lon - radius),
    Math.min(RWANDA.north, lat + radius),
    Math.min(RWANDA.east, lon + radius)
  );
  const roadRadius = 0.035;
  const roadQuery = buildRoadQuery(
    Math.max(RWANDA.south, lat - roadRadius),
    Math.max(RWANDA.west, lon - roadRadius),
    Math.min(RWANDA.north, lat + roadRadius),
    Math.min(RWANDA.east, lon + roadRadius)
  );
  const [elements, roadElements] = await Promise.all([
    getOsmElements(query),
    getOsmElements(roadQuery).catch((error) => {
      console.warn("Main-road geometry unavailable for nearby-access lookup.", error);
      return [] as OsmElement[];
    })
  ]);

  const unique = new Map<string, Candidate>();
  for (const element of elements) {
    const tags = element.tags ?? {};
    const category = classify(tags);
    if (!category) continue;
    const pointLat = element.type === "node" ? element.lat : element.center?.lat;
    const pointLon = element.type === "node" ? element.lon : element.center?.lon;
    if (typeof pointLat !== "number" || typeof pointLon !== "number" || !Number.isFinite(pointLat) || !Number.isFinite(pointLon)) continue;
    const straightKm = haversineKm(lat, lon, pointLat, pointLon);
    if (straightKm > 6) continue;
    const id = "osm-" + element.type + "-" + element.id;
    if (!unique.has(id)) unique.set(id, {
      id, name: tags.name?.trim() || tags["name:en"]?.trim() || categoryName(category),
      category, lat: pointLat, lon: pointLon, straightKm
    });
  }

  // Measure the shortest distance from the parcel-area center to a mapped
  // trunk/primary/secondary/tertiary road segment. This is straight-line
  // proximity, not a driving route or a legal driveway-access determination.
  let nearestRoad: RouteResult | null = null;
  let nearestRoadDistanceKm = Number.POSITIVE_INFINITY;
  for (const road of roadElements) {
    const points = road.geometry ?? [];
    if (points.length < 2) continue;
    for (let index = 1; index < points.length; index += 1) {
      const distanceKm = distanceToRoadSegmentKm({ lat, lon }, points[index - 1], points[index]);
      if (distanceKm < nearestRoadDistanceKm) {
        nearestRoadDistanceKm = distanceKm;
        const tags = road.tags ?? {};
        const highway = (tags.highway ?? "main").replace(/_/g, " ");
        nearestRoad = {
          id: "osm-road-" + road.id,
          category: "Main road",
          name: tags.name?.trim() || tags["name:en"]?.trim() || highway.charAt(0).toUpperCase() + highway.slice(1) + " road",
          distanceKm: Math.round(distanceKm * 1000) / 1000,
          timeMinutes: null,
          routeStatus: "straight-line"
        };
      }
    }
  }

  // Fetch road-route estimates for the nearest mapped facility in each category.
  // Calls are limited to one candidate per category and cached by parcel center.
  const categories: NearbyAmenityCategory[] = [
    "School", "Clinic / hospital", "Public transport", "Landmark", "Village office"
  ];
  const nearest = categories.map((category) => Array.from(unique.values())
    .filter((candidate) => candidate.category === category)
    .sort((a, b) => a.straightKm - b.straightKm)[0])
    .filter((candidate): candidate is Candidate => Boolean(candidate));
  const routedItems = await Promise.all(nearest.map((candidate) => getRoadRoute({ lat, lon }, candidate)));
  const items: RouteResult[] = [
    ...(nearestRoad ? [nearestRoad] : []),
    ...routedItems
  ];
  const noteParts = [
    "Facility distances and driving times are estimated from the parcel-area center; road routes do not include live traffic.",
    "Main-road distance is straight-line proximity to the nearest mapped trunk, primary, secondary or tertiary road, not proof of a driveway or legal access.",
    "OpenStreetMap may have incomplete or outdated facility and landmark coverage."
  ];
  if (!nearestRoad) noteParts.push("No nearby main-road geometry was returned by the map source for this request.");
  return { items, note: noteParts.join(" ") };
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const lat = Number(params.get("lat"));
  const lon = Number(params.get("lon"));
  const district = (params.get("district") ?? "").trim().toLowerCase();
  if (!Number.isFinite(lat) || !Number.isFinite(lon) ||
      lat < RWANDA.south || lat > RWANDA.north || lon < RWANDA.west || lon > RWANDA.east) {
    return NextResponse.json({ status: "error", items: [], message: "A valid Rwanda parcel center is required." }, { status: 400 });
  }

  const cacheKey = [lat.toFixed(4), lon.toFixed(4), district].join("|");
  const cached = responseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json({ status: "ready", items: cached.value.items, source: "Valhalla · OpenStreetMap road graph", note: cached.value.note },
      { headers: { "Cache-Control": "public, max-age=60, s-maxage=300" } });
  }
  if (cached) responseCache.delete(cacheKey);

  let pending = inFlight.get(cacheKey);
  if (!pending) {
    pending = calculateNearbyRoutes(lat, lon)
      .then((value) => {
        responseCache.set(cacheKey, { expiresAt: Date.now() + CACHE_MS, value });
        while (responseCache.size > 100) {
          const firstKey = responseCache.keys().next().value;
          if (!firstKey) break;
          responseCache.delete(firstKey);
        }
        return value;
      })
      .finally(() => inFlight.delete(cacheKey));
    inFlight.set(cacheKey, pending);
  }

  try {
    const value = await pending;
    return NextResponse.json({ status: "ready", items: value.items, source: "Valhalla · OpenStreetMap road graph", note: value.note },
      { headers: { "Cache-Control": "public, max-age=60, s-maxage=300" } });
  } catch {
    return NextResponse.json({
      status: "error", items: [], source: "Valhalla · OpenStreetMap road graph",
      note: "Estimated road routes; not live traffic.",
      message: "Nearby road access could not be loaded for this parcel."
    }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
