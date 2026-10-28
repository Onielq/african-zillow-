import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const revalidate = 0;

type Coordinate = { latitude: number; longitude: number };
type Target = Coordinate & {
  id: string;
  name?: string;
  category?: "school" | "healthcare" | "transport";
};

type ValhallaRouteCell = {
  distance?: number | null;
  time?: number | null;
  error?: { code?: number; message?: string } | null;
};

type ValhallaMatrixResponse = {
  sources_to_targets?: ValhallaRouteCell[][];
  distances?: Array<Array<number | null>>;
  durations?: Array<Array<number | null>>;
  error?: string;
  status?: string;
};

const MAX_TARGETS = 12;

function isCoordinate(value: unknown): value is Coordinate {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.latitude === "number" &&
    Number.isFinite(candidate.latitude) &&
    typeof candidate.longitude === "number" &&
    Number.isFinite(candidate.longitude) &&
    candidate.latitude >= -4.5 && candidate.latitude <= 0.5 &&
    candidate.longitude >= 28 && candidate.longitude <= 32.5;
}

function isTarget(value: unknown): value is Target {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === "string" &&
    candidate.id.length > 0 &&
    candidate.id.length <= 180 &&
    isCoordinate(candidate);
}

function safeUrl(baseUrl: string): string | null {
  try {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    parsed.search = "";
    parsed.hash = "";
    const base = parsed.toString().replace(/\/+$/, "");
    return base.endsWith("/sources_to_targets") ? base : base + "/sources_to_targets";
  } catch {
    return null;
  }
}

function validNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export async function POST(request: NextRequest) {
  let payload: { origin?: unknown; targets?: unknown };
  try {
    payload = await request.json() as { origin?: unknown; targets?: unknown };
  } catch {
    return NextResponse.json({ status: "invalid-request", message: "Request body must be valid JSON." }, { status: 400 });
  }

  if (!isCoordinate(payload.origin) || !Array.isArray(payload.targets) ||
      payload.targets.length < 1 || payload.targets.length > MAX_TARGETS ||
      !payload.targets.every(isTarget)) {
    return NextResponse.json({
      status: "invalid-request",
      message: "Provide a Rwanda-area origin and between 1 and 12 mapped target coordinates."
    }, { status: 400 });
  }

  const baseUrl = process.env.VALHALLA_BASE_URL?.trim();
  if (!baseUrl) {
    return NextResponse.json({
      status: "not-configured",
      message: "Valhalla route service is not configured. Road distance and travel time are withheld."
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  const endpoint = safeUrl(baseUrl);
  if (!endpoint) {
    return NextResponse.json({
      status: "configuration-error",
      message: "VALHALLA_BASE_URL must be a valid HTTP(S) base URL."
    }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }

  const targets = payload.targets as Target[];
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-Client-Id": "rwanda-land-intelligence"
      },
      body: JSON.stringify({
        sources: [{ lat: payload.origin.latitude, lon: payload.origin.longitude }],
        targets: targets.map((target) => ({ lat: target.latitude, lon: target.longitude })),
        costing: "auto",
        units: "kilometers",
        verbose: false
      }),
      signal: AbortSignal.timeout(15000),
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error("Valhalla returned HTTP " + response.status);
    }
    const matrix = await response.json() as ValhallaMatrixResponse;
    if (!Array.isArray(matrix.sources_to_targets?.[0]) &&
        !Array.isArray(matrix.distances?.[0]) &&
        !Array.isArray(matrix.durations?.[0])) {
      throw new Error(matrix.error || "Valhalla did not return a route matrix.");
    }

    const cells = matrix.sources_to_targets?.[0] ?? [];
    const distances = matrix.distances?.[0] ?? [];
    const durations = matrix.durations?.[0] ?? [];
    const results = targets.map((target, index) => {
      const cell = cells[index];
      const distanceKm = validNumber(cell?.distance)
        ? cell.distance
        : validNumber(distances[index]) ? distances[index] : null;
      const timeSeconds = validNumber(cell?.time)
        ? cell.time
        : validNumber(durations[index]) ? durations[index] : null;
      return {
        id: target.id,
        distanceMeters: distanceKm === null ? null : Math.round(distanceKm * 1000),
        timeSeconds: timeSeconds === null ? null : Math.round(timeSeconds),
        reachable: distanceKm !== null || timeSeconds !== null,
        error: cell?.error?.message ?? null
      };
    });

    return NextResponse.json({
      status: "ready",
      costing: "auto",
      units: "kilometers",
      results,
      note: "Route estimates use mapped roads and do not include live traffic. The origin is the parcel extent midpoint, not a surveyed entrance."
    }, {
      headers: {
        "Cache-Control": "private, max-age=0, no-store",
        "X-Route-Provider": "Valhalla"
      }
    });
  } catch (error) {
    console.error("Valhalla nearby-access matrix failed.", error);
    return NextResponse.json({
      status: "unavailable",
      message: "A road route could not be confirmed. Straight-line proximity is not presented as road access."
    }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}