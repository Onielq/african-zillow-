const RWANDA_BOUNDS = {
  west: 28.7,
  east: 31.05,
  south: -2.95,
  north: -1.0
};

const ACCESS_CATEGORIES = new Set([
  "Main road",
  "School",
  "Clinic / hospital",
  "Public transport",
  "Landmark",
  "Village office"
]);

/**
 * A report may request nearby access only from a project coordinate whose
 * recorded precision supports a location-specific lookup. District/sector
 * labels are context, not a valid origin point.
 */
export function isPreciseProjectLocation(location) {
  if (!location || !["address-coordinate", "parcel-upi"].includes(location.precision)) {
    return false;
  }

  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  return Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= RWANDA_BOUNDS.south &&
    latitude <= RWANDA_BOUNDS.north &&
    longitude >= RWANDA_BOUNDS.west &&
    longitude <= RWANDA_BOUNDS.east;
}

/**
 * Read the same bounded OpenStreetMap/Valhalla service used by parcel details.
 * No lookup is attempted for administrative-area-only records.
 */
export async function fetchProjectNearbyAccess(location, fetchImpl = globalThis.fetch) {
  if (!isPreciseProjectLocation(location)) {
    return { status: "not-eligible", items: [], source: "", note: "" };
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("Nearby access fetch is unavailable.");
  }

  const params = new URLSearchParams({
    lat: String(Number(location.latitude)),
    lon: String(Number(location.longitude)),
    district: String(location.district ?? "")
  });
  const response = await fetchImpl("/api/geography/nearby-access?" + params.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    throw new Error("Nearby access returned HTTP " + response.status + ".");
  }

  const payload = await response.json();
  if (!payload || payload.status !== "ready" || !Array.isArray(payload.items)) {
    throw new Error("Nearby access returned an invalid response.");
  }

  return {
    status: "ready",
    items: payload.items,
    source: typeof payload.source === "string" ? payload.source : "",
    note: typeof payload.note === "string" ? payload.note : ""
  };
}

/**
 * Keep route distance, straight-line proximity and unavailable routes distinct.
 * In particular, never show a road ETA for a straight-line measurement.
 */
export function formatProjectNearbyAccessItem(item) {
  if (!item || !ACCESS_CATEGORIES.has(item.category)) return null;

  const name = typeof item.name === "string" && item.name.trim()
    ? item.name.trim()
    : "Unnamed " + item.category.toLowerCase();

  const numericDistance = item.distanceKm == null ? Number.NaN : Number(item.distanceKm);
  const hasDistance = Number.isFinite(numericDistance) && numericDistance >= 0;
  const distance = hasDistance ? (Math.round(numericDistance * 100) / 100) + " km" : "";

  let distanceLabel = "Distance unavailable";
  if (item.routeStatus === "routed" && hasDistance) {
    const minutes = item.timeMinutes == null ? Number.NaN : Number(item.timeMinutes);
    const eta = Number.isFinite(minutes) && minutes >= 0
      ? " · about " + Math.round(minutes) + " min"
      : "";
    distanceLabel = distance + " by road" + eta;
  } else if (item.routeStatus === "straight-line" && hasDistance) {
    distanceLabel = item.category === "Main road"
      ? distance + " straight-line proximity · not a driveway/access confirmation"
      : distance + " straight-line · road route unavailable";
  } else if (item.routeStatus === "unavailable") {
    distanceLabel = "Road route unavailable";
  }

  return { category: item.category, name, distanceLabel };
}
