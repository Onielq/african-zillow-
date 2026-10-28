import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const revalidate = 60;

type OsmElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string | undefined>;
};
type OsmResponse = { elements?: OsmElement[]; remark?: string };
type NearbyCategory = "School" | "Clinic / hospital" | "Public transport";
type Candidate = { id: string; name: string; category: NearbyCategory; lat: number; lon: number; straightKm: number };
type RouteResult = { id: string; category: NearbyCategory; name: string; distanceKm: number | null; timeMinutes: number | null; routeStatus: "routed" | "unavailable" };
type ValhallaResponse = {
  trip?: { status?: number; status_message?: string; summary?: { length?: number; time?: number }; legs?: Array<{ summary?: { length?: number; time?: number }> } };
  error?: string;
  error_code?: number;
};

const RWANDA = { west: 28.7, east: 31.05, south: -2.95, north: -1.0 };
const OVERPASS_ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
const VALHALLA_BASE = (process.env.VALHALLA_ROUTING_URL?.trim() || "https://valhalla1.openstreetmap.de").replace(/\\/+$/, "");
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

function classify(tags: Record<string, string | undefined>): NearbyCategory | null {
  const amenity = (tags.amenity ?? "").toLowerCase();
  const healthcare = (tags.healthcare ?? "").toLowerCase();
  if (["school", "university", "college", "kindergarten"].includes(amenity)) return "School";
  if (["hospital", "clinic", "doctors", "pharmacy"].includes(amenity) ||
      ["hospital", "clinic", "doctor", "pharmacy"].includes(healthcare)) return "Clinic / hospital";
  if (tags.highway === "bus_stop" || ["bus_stop", "bus_station"].includes(amenity)) return "Public transport";
  return null;
}

function categoryName(category: NearbyCategory): string {
  return category === "School" ? "Unnamed school" :
    category === "Clinic / hospital" ? "Unnamed medical facility" : "Unnamed transport stop";
}

function buildQuery(south: number, west: number, north: number, east: number): string {
  const box = [south, west, north, east].map((value) => value.toFixed(6)).join(",");
  return [
    "[out:json][timeout:8];", "(",
    'nwr["amenity"~"school|university|college|kindergarten|hospital|clinic|doctors|pharmacy|bus_station|bus_stop"](' + box + ");",
    'nwr["healthcare"~"hospital|clinic|doctor|pharmacy"](' + box + ");",
    'node["highway"="bus_stop"](' + box + ");",
    ");", "out center tags;"
  ].join("\n");
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
  const elements = await getOsmElements(query);
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

  // Route the nearest mapped candidate in each category, limiting each parcel
  // click to a small, cached set of independent Valhalla route requests.
  const categories: NearbyCategory[] = ["School", "Clinic / hospital", "Public transport"];
  const nearest = categories.map((category) => Array.from(unique.values())
    .filter((candidate) => candidate.category === category)
    .sort((a, b) => a.straightKm - b.straightKm)[0])
    .filter((candidate): candidate is Candidate => Boolean(candidate));
  const items = await Promise.all(nearest.map((candidate) => getRoadRoute({ lat, lon }, candidate)));
  items.sort((a, b) => categories.indexOf(a.category) - categories.indexOf(b.category));
  return {
    items,
    note: "Estimated driving routes from the parcel-area center; no live traffic. Amenity coverage from OpenStreetMap may be incomplete."
  };
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
