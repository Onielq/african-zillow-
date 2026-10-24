import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type OverlayCategory = "landmarks" | "medical" | "schools" | "transport" | "nature";
type OverlayScope = "combined" | "kigali" | "bugesera";
type Bounds = [number, number, number, number];

type OverpassElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  geometry?: Array<{ lat: number; lon: number }>;
  tags?: Record<string, string>;
};

const RWANDA_BOUNDS: Bounds = [28.7, -2.95, 31.05, -1.0];
// These are query extents for the current map pilot, not legal district boundaries.
const SCOPE_BOUNDS: Record<OverlayScope, Bounds> = {
  kigali: [29.58, -2.12, 30.32, -1.47],
  bugesera: [29.82, -2.62, 30.56, -1.92],
  combined: [29.58, -2.62, 30.56, -1.47]
};
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter"
];

function parseBounds(value: string | null): Bounds | null {
  if (!value) return null;
  const numbers = value.split(",").map((part) => Number(part.trim()));
  if (numbers.length !== 4 || numbers.some((number) => !Number.isFinite(number))) return null;
  const [west, south, east, north] = numbers;
  if (west >= east || south >= north) return null;
  return [west, south, east, north];
}

function intersectBounds(left: Bounds, right: Bounds): Bounds | null {
  const bounds: Bounds = [
    Math.max(left[0], right[0]),
    Math.max(left[1], right[1]),
    Math.min(left[2], right[2]),
    Math.min(left[3], right[3])
  ];
  return bounds[0] < bounds[2] && bounds[1] < bounds[3] ? bounds : null;
}

function isCategory(value: string | null): value is OverlayCategory {
  return value === "landmarks" || value === "medical" || value === "schools" ||
    value === "transport" || value === "nature";
}

function isScope(value: string | null): value is OverlayScope {
  return value === "combined" || value === "kigali" || value === "bugesera";
}

function makeOverpassQuery(category: OverlayCategory, scope: OverlayScope, bounds: Bounds): string {
  const box = bounds[1] + "," + bounds[0] + "," + bounds[3] + "," + bounds[2];
  const areaPattern = scope === "kigali"
    ? "^(Gasabo|Kicukiro|Nyarugenge)$"
    : scope === "bugesera"
      ? "^Bugesera$"
      : "^(Gasabo|Kicukiro|Nyarugenge|Bugesera)$";
  const areaFilter = 'area["boundary"="administrative"]["name"~"' + areaPattern + '"]->.pilot;';
  const queries: Record<OverlayCategory, string> = {
    landmarks:
      'nwr(area.pilot)["tourism"~"^(attraction|museum|viewpoint|artwork|zoo|gallery)$"](' + box + ');' +
      'nwr(area.pilot)["historic"~"^(monument|memorial|castle|archaeological_site)$"](' + box + ');' +
      'nwr(area.pilot)["man_made"~"^(obelisk|tower)$"](' + box + ');',
    medical:
      'nwr(area.pilot)["amenity"~"^(hospital|clinic|doctors|dentist|pharmacy)$"](' + box + ');' +
      'nwr(area.pilot)["healthcare"~"^(hospital|clinic|doctor|centre|pharmacy)$"](' + box + ');',
    schools:
      'nwr(area.pilot)["amenity"~"^(school|university|college|kindergarten)$"](' + box + ');' +
      'nwr(area.pilot)["building"="school"](' + box + ');',
    transport:
      'way(area.pilot)["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|service)$"](' + box + ');' +
      'nwr(area.pilot)["amenity"~"^(bus_station|bus_stop)$"](' + box + ');' +
      'nwr(area.pilot)["public_transport"~"^(station|platform)$"](' + box + ');',
    nature:
      'nwr(area.pilot)["leisure"~"^(park|nature_reserve)$"](' + box + ');' +
      'nwr(area.pilot)["natural"~"^(water|waterfall)$"](' + box + ');' +
      'nwr(area.pilot)["water"~"^(lake|reservoir|pond)$"](' + box + ');' +
      'nwr(area.pilot)["waterway"="waterfall"](' + box + ');'
  };
  return "[out:json][timeout:22];" + areaFilter + "(" + queries[category] + ");out center geom qt;";
}

function toFeature(element: OverpassElement, category: OverlayCategory) {
  const tags = element.tags ?? {};
  const name = tags.name ?? tags["name:en"] ?? tags.brand ?? tags.operator ?? null;
  let geometry: Record<string, unknown> | null = null;
  let kind = "place";

  if (category === "transport" && tags.highway) kind = "road";
  else if (category === "transport") kind = "stop";
  else if (category === "nature") kind =
    tags.waterway === "waterfall" || tags.natural === "waterfall" ? "waterfall" : "nature";
  else if (category === "medical") kind = "medical";
  else if (category === "schools") kind = "school";
  else if (category === "landmarks") kind = "landmark";

  if (element.type === "node" && typeof element.lon === "number" && typeof element.lat === "number") {
    geometry = { type: "Point", coordinates: [element.lon, element.lat] };
  } else if (element.geometry && element.geometry.length > 1) {
    const coordinates = element.geometry
      .filter((point) => Number.isFinite(point.lon) && Number.isFinite(point.lat))
      .map((point) => [point.lon, point.lat]);
    if (coordinates.length > 1) {
      const first = coordinates[0];
      const last = coordinates[coordinates.length - 1];
      const closed = first[0] === last[0] && first[1] === last[1];
      const canFill = closed && (
        category === "nature" || tags.area === "yes" ||
        tags.building === "yes" || tags.historic === "monument"
      );
      geometry = canFill
        ? { type: "Polygon", coordinates: [coordinates] }
        : { type: "LineString", coordinates };
    }
  } else if (element.center && typeof element.center.lon === "number" && typeof element.center.lat === "number") {
    geometry = { type: "Point", coordinates: [element.center.lon, element.center.lat] };
  }
  if (!geometry) return null;

  return {
    type: "Feature" as const,
    id: "osm-" + element.type + "-" + element.id,
    geometry,
    properties: {
      name,
      category,
      kind,
      subtype: tags.amenity ?? tags.highway ?? tags.tourism ?? tags.natural ??
        tags.leisure ?? tags.waterway ?? null,
      source: "OpenStreetMap",
      osm_type: element.type,
      osm_id: element.id
    }
  };
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const categoryValue = params.get("category");
  const scopeValue = params.get("scope");
  const bounds = parseBounds(params.get("bbox"));
  const zoom = Number(params.get("zoom") ?? "0");

  if (!isCategory(categoryValue)) {
    return NextResponse.json({ error: "Unsupported overlay category." }, { status: 400 });
  }
  const scope = isScope(scopeValue) ? scopeValue : "combined";
  if (!bounds) {
    return NextResponse.json({ error: "bbox must be west,south,east,north." }, { status: 400 });
  }

  const scopeLimited = intersectBounds(bounds, SCOPE_BOUNDS[scope]);
  const countryLimited = scopeLimited ? intersectBounds(scopeLimited, RWANDA_BOUNDS) : null;
  if (!countryLimited) {
    return NextResponse.json({ type: "FeatureCollection", features: [] }, {
      headers: { "Cache-Control": "public, max-age=0, s-maxage=180" }
    });
  }

  const width = countryLimited[2] - countryLimited[0];
  const height = countryLimited[3] - countryLimited[1];
  const maxSpan = categoryValue === "transport" ? 0.45 : 0.9;
  if (zoom < 7.4 || width > maxSpan || height > maxSpan) {
    return NextResponse.json({ type: "FeatureCollection", features: [] }, {
      headers: {
        "Cache-Control": "public, max-age=60",
        "X-Overlay-Status": "zoom-in",
        "X-Overlay-Message": "Zoom into a pilot area to load community-mapped features."
      }
    });
  }

  const query = makeOverpassQuery(categoryValue, scope, countryLimited);
  let lastError: unknown = null;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
        },
        body: new URLSearchParams({ data: query }).toString(),
        signal: AbortSignal.timeout(25_000)
      });
      if (!response.ok) {
        lastError = new Error("Overpass returned HTTP " + response.status);
        continue;
      }
      const payload = await response.json() as { elements?: OverpassElement[]; remark?: string };
      if (payload.remark) {
        lastError = new Error(payload.remark);
        continue;
      }
      const elements = payload.elements ?? [];
      const features = elements.slice(0, 2500)
        .map((element) => toFeature(element, categoryValue))
        .filter((feature): feature is NonNullable<typeof feature> => feature !== null);
      return NextResponse.json({ type: "FeatureCollection", features }, {
        headers: {
          "Cache-Control": "public, max-age=0, s-maxage=180, stale-while-revalidate=600",
          "X-Map-Overlay-Source": "OpenStreetMap contributors via Overpass API",
          "X-Map-Overlay-Scope": scope,
          "X-Map-Overlay-Truncated": String(elements.length > 2500),
          "X-Map-Overlay-Note": "Pilot service extents are viewport limits, not legal boundary statements."
        }
      });
    } catch (error) {
      lastError = error;
    }
  }

  console.warn("Overpass overlay request failed at all configured endpoints.", lastError);
  return NextResponse.json({ error: "The community-mapped overlay is temporarily unavailable." }, {
    status: 502,
    headers: { "Cache-Control": "no-store" }
  });
}
