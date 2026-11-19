const RWANDA_BOUNDS = {
  west: 28.7,
  east: 31.05,
  south: -2.95,
  north: -1.0
};

export const PROJECT_NEARBY_ACCESS_TIMEOUT_MS = 30_000;

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
    signal: AbortSignal.timeout(PROJECT_NEARBY_ACCESS_TIMEOUT_MS)
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


/**
 * Mount the shared live access panel in a project report. Existing report facts
 * remain untouched; these results are a separate, current map-source lookup.
 */
export async function mountProjectNearbyAccess({ location, grid, note }) {
  if (!grid) return { status: "not-mounted", items: [] };

  const renderMessage = (title, detail) => {
    grid.replaceChildren();
    const item = document.createElement("div");
    item.className = grid.classList.contains("access-grid") ? "access-item" : "report-access-item";
    const heading = document.createElement("b");
    heading.textContent = title;
    const description = document.createElement("span");
    description.textContent = detail;
    item.append(heading, description);
    grid.appendChild(item);
  };

  const setNote = (message, addAttribution = false) => {
    if (!note) return;
    note.textContent = message;
    if (addAttribution) {
      note.appendChild(document.createTextNode(" "));
      const attribution = document.createElement("a");
      attribution.href = "https://www.openstreetmap.org/copyright";
      attribution.target = "_blank";
      attribution.rel = "noopener noreferrer";
      attribution.textContent = "OpenStreetMap attribution";
      note.appendChild(attribution);
    }
  };

  if (!isPreciseProjectLocation(location)) {
    renderMessage(
      "Area context only",
      "Nearby distances were not calculated because this project record does not contain a precise, source-backed coordinate. This is not evidence that nearby facilities or road access are absent."
    );
    setNote("No coordinate-specific lookup was run. The map shows administrative-area context only.");
    return { status: "not-eligible", items: [] };
  }

  grid.setAttribute("aria-busy", "true");
  renderMessage("Nearby access", "Checking mapped facilities and road proximity…");
  setNote("Source lookup in progress.");

  try {
    const payload = await fetchProjectNearbyAccess(location);
    const items = payload.items
      .map(formatProjectNearbyAccessItem)
      .filter((item) => item !== null);
    grid.replaceChildren();

    if (items.length === 0) {
      renderMessage(
        "No mapped results returned",
        "The map source returned no nearby facilities or main-road geometry for this coordinate. Coverage may be incomplete; this does not prove that facilities or legal access are absent."
      );
    } else {
      items.forEach((nearby) => {
        const item = document.createElement("div");
        item.className = grid.classList.contains("access-grid") ? "access-item" : "report-access-item";
        const heading = document.createElement("b");
        heading.textContent = nearby.category;
        const name = document.createElement("span");
        name.textContent = nearby.name;
        const distance = document.createElement("span");
        distance.textContent = nearby.distanceLabel;
        item.append(heading, name, distance);
        grid.appendChild(item);
      });
    }

    setNote([payload.source, payload.note].filter(Boolean).join(" · "), true);
    return { status: "ready", items };
  } catch {
    renderMessage(
      "Nearby access unavailable",
      "The nearby-access service could not return results. A service failure is not evidence that facilities or road access are absent."
    );
    setNote("Nearby access could not be checked. No distance or travel time is being inferred.");
    return { status: "error", items: [] };
  } finally {
    grid.setAttribute("aria-busy", "false");
  }
}
