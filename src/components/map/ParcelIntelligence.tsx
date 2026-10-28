"use client";

import { useEffect, useMemo, useState } from "react";
import type { SelectedArea } from "@/components/map/MapView";
import styles from "./ParcelIntelligence.module.css";

export type ParcelComparisonItem = {
  id: string;
  name: string;
  district: string;
  locationLabel: string;
  askingPrice: number | null;
  pricePerM2: number | null;
  areaM2: number | null;
  areaIsEstimate: boolean;
  zoning: string;
  zoningStatus: "mapped" | "not-mapped" | "pending" | "unavailable";
  priceStatus: "published" | "estimated" | "missing";
  sourceLabel: string | null;
  coverageStatus: string;
};

type PriceStatus = ParcelComparisonItem["priceStatus"];

type Amenity = {
  id: string;
  name: string;
  category: "school" | "healthcare" | "transport";
  latitude: number;
  longitude: number;
  approximateDistanceMeters: number;
  routeDistanceMeters: number | null;
  routeTimeSeconds: number | null;
};

type AccessStatus = "idle" | "loading" | "ready" | "no-places" | "routing-unavailable" | "error";

type AccessState = {
  status: AccessStatus;
  places: Amenity[];
  message?: string;
};

type Props = {
  selectedArea: SelectedArea;
  askingPrice: number | null;
  pricePerM2: number | null;
  priceStatus: PriceStatus;
  comparisonItems: ParcelComparisonItem[];
  onAddToComparison: (item: ParcelComparisonItem) => void;
  onUpdateComparison: (item: ParcelComparisonItem) => void;
};

type OSMFeature = {
  id?: string | number;
  geometry?: { type?: string; coordinates?: unknown };
  properties?: {
    overlay_category?: string;
    name?: string;
    detail?: string;
    source_id?: string;
  };
};

function parcelIdentity(area: SelectedArea): string {
  return (area.district + "|" + (area.upi ?? area.name)).trim().toLowerCase();
}

function zoningFor(area: SelectedArea): { label: string; status: ParcelComparisonItem["zoningStatus"] } {
  if (area.zoningStatus === "found" && area.zoning?.length) {
    const label = area.zoning.map((zone) => {
      const code = zone.code?.trim();
      const name = zone.name.trim();
      return code && !name.toLowerCase().startsWith(code.toLowerCase()) ? code + " — " + name : name;
    }).join(" · ");
    return { label, status: "mapped" };
  }
  if (area.zoningStatus === "not-covered") return { label: "No mapped designation", status: "not-mapped" };
  if (area.zoningStatus === "loading" || !area.zoningStatus) return { label: "Not loaded", status: "pending" };
  return { label: "Unavailable", status: "unavailable" };
}

function formatMoney(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "Not available";
  return "RWF " + new Intl.NumberFormat("en-RW", { maximumFractionDigits: 0 }).format(value);
}

function formatRate(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "Not available";
  return new Intl.NumberFormat("en-RW", { maximumFractionDigits: 0 }).format(value) + " RWF/m²";
}

function formatArea(value: number | null, approximate: boolean): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "Not available";
  return (approximate ? "Approx. " : "") +
    new Intl.NumberFormat("en-RW", { maximumFractionDigits: 0 }).format(value) + " m²";
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const radians = (value: number) => value * Math.PI / 180;
  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

function categoryForFeature(feature: OSMFeature): Amenity["category"] | null {
  if (feature.geometry?.type !== "Point" || !Array.isArray(feature.geometry.coordinates)) return null;
  const detail = String(feature.properties?.detail ?? "").toLowerCase();
  const name = String(feature.properties?.name ?? "").toLowerCase();
  if (/bus_stop|bus_station|bus stop|bus station/.test(detail + " " + name)) return "transport";
  if (/school|university|college/.test(detail)) return "school";
  if (/hospital|clinic|doctor|pharmacy|healthcare/.test(detail)) return "healthcare";
  return null;
}

function nearestByCategory(places: Amenity[], useRoadDistance: boolean): Amenity[] {
  const categories: Amenity["category"][] = ["school", "healthcare", "transport"];
  return categories.flatMap((category) => {
    const group = places.filter((place) => place.category === category);
    group.sort((a, b) => {
      if (useRoadDistance) {
        const aRoad = a.routeDistanceMeters ?? Number.MAX_SAFE_INTEGER;
        const bRoad = b.routeDistanceMeters ?? Number.MAX_SAFE_INTEGER;
        if (aRoad !== bRoad) return aRoad - bRoad;
      }
      return a.approximateDistanceMeters - b.approximateDistanceMeters;
    });
    return group.length ? [group[0]] : [];
  });
}

function formatRouteDistance(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return "";
  if (value >= 1000) return (value / 1000).toLocaleString("en-RW", { maximumFractionDigits: 1 }) + " km";
  return Math.round(value).toLocaleString("en-RW") + " m";
}

function formatDriveTime(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return "";
  const minutes = Math.max(1, Math.round(value / 60));
  return "about " + minutes + " min drive";
}

export function ParcelIntelligenceInline({
  selectedArea,
  askingPrice,
  pricePerM2,
  priceStatus,
  comparisonItems,
  onAddToComparison,
  onUpdateComparison
}: Props) {
  const [access, setAccess] = useState<AccessState>({ status: "idle", places: [] });
  const identity = parcelIdentity(selectedArea);
  const alreadyAdded = comparisonItems.some((item) => item.id === identity);
  const zoning = zoningFor(selectedArea);
  const hasCadastralRecord = selectedArea.sourceType === "cadastral-parcel" && Boolean(selectedArea.sourceLabel);
  const coverageStatus = selectedArea.district.trim().toLowerCase() === "bugesera"
    ? "Unverified coverage"
    : "Completeness not independently checked";
  const areaM2 = typeof selectedArea.parcelSizeM2 === "number" && selectedArea.parcelSizeM2 > 0
    ? selectedArea.parcelSizeM2
    : null;
  const locationLabel = [selectedArea.village, selectedArea.cell, selectedArea.sector, selectedArea.district]
    .filter(Boolean).join(" · ");
  const missing: string[] = [];
  if (askingPrice === null) missing.push("total asking price");
  if (pricePerM2 === null) missing.push("price per m²");
  if (areaM2 === null) missing.push("parcel area");
  if (zoning.status !== "mapped") missing.push("mapped zoning");

  const comparisonItem = useMemo<ParcelComparisonItem>(() => ({
    id: identity,
    name: selectedArea.name,
    district: selectedArea.district,
    locationLabel,
    askingPrice,
    pricePerM2,
    areaM2,
    areaIsEstimate: selectedArea.parcelSizeSource === "geometry-estimate",
    zoning: zoning.label,
    zoningStatus: zoning.status,
    priceStatus,
    sourceLabel: selectedArea.sourceLabel ?? null,
    coverageStatus
  }), [
    identity,
    selectedArea.name,
    selectedArea.district,
    selectedArea.parcelSizeSource,
    selectedArea.sourceLabel,
    locationLabel,
    askingPrice,
    pricePerM2,
    areaM2,
    zoning.label,
    zoning.status,
    priceStatus,
    coverageStatus
  ]);

  useEffect(() => {
    if (alreadyAdded) onUpdateComparison(comparisonItem);
  }, [alreadyAdded, comparisonItem, onUpdateComparison]);

  const bounds = selectedArea.bounds;
  const latitude = bounds ? (bounds[1] + bounds[3]) / 2 : null;
  const longitude = bounds ? (bounds[0] + bounds[2]) / 2 : null;

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function loadNearbyAccess() {
      if (latitude === null || longitude === null || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        setAccess({
          status: "error",
          places: [],
          message: "A parcel location point is not available for route analysis."
        });
        return;
      }

      setAccess({ status: "loading", places: [] });
      try {
        // The bounding box only limits which places are searched. It is not used as a distance estimate.
        const latDelta = 0.027;
        const lonDelta = 0.027 / Math.max(0.7, Math.cos(latitude * Math.PI / 180));
        const bbox = [
          longitude - lonDelta,
          latitude - latDelta,
          longitude + lonDelta,
          latitude + latDelta
        ].join(",");
        const scope = selectedArea.district.trim().toLowerCase() === "bugesera" ? "bugesera" : "kigali";
        const placeUrl = "/api/geography/places?bbox=" + encodeURIComponent(bbox) +
          "&categories=healthEducation,transportation&scope=" + scope;
        const placeResponse = await fetch(placeUrl, { signal: controller.signal });
        if (!placeResponse.ok) throw new Error("Nearby place lookup failed.");
        const placePayload = await placeResponse.json() as { features?: OSMFeature[] };
        const candidates: Amenity[] = [];
        for (const feature of placePayload.features ?? []) {
          const category = categoryForFeature(feature);
          const coordinates = feature.geometry?.coordinates;
          if (!category || !Array.isArray(coordinates) || typeof coordinates[0] !== "number" ||
            typeof coordinates[1] !== "number") continue;
          const lon = coordinates[0];
          const lat = coordinates[1];
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
          const properties = feature.properties ?? {};
          candidates.push({
            id: String(properties.source_id ?? feature.id ?? properties.name ?? candidates.length),
            name: String(properties.name ?? "Unnamed mapped place"),
            category,
            latitude: lat,
            longitude: lon,
            approximateDistanceMeters: haversineMeters(latitude, longitude, lat, lon),
            routeDistanceMeters: null,
            routeTimeSeconds: null
          });
        }

        const deduplicated = new Map<string, Amenity>();
        for (const place of candidates) {
          if (!deduplicated.has(place.id)) deduplicated.set(place.id, place);
        }
        const nearestCandidates = Array.from(deduplicated.values())
          .sort((a, b) => a.approximateDistanceMeters - b.approximateDistanceMeters)
          .reduce((grouped, place) => {
            const count = grouped.filter((entry) => entry.category === place.category).length;
            if (count < 4) grouped.push(place);
            return grouped;
          }, [] as Amenity[]).slice(0, 12);

        if (nearestCandidates.length === 0) {
          if (active) setAccess({ status: "no-places", places: [] });
          return;
        }

        let routingStatus: "ready" | "routing-unavailable" = "routing-unavailable";
        let routedPlaces = nearestCandidates;
        try {
          const routeResponse = await fetch("/api/geography/nearby-access", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify({
              origin: { latitude, longitude },
              targets: nearestCandidates.map((place) => ({
                id: place.id,
                name: place.name,
                category: place.category,
                latitude: place.latitude,
                longitude: place.longitude
              }))
            }),
            signal: controller.signal
          });
          const routePayload = await routeResponse.json() as {
            status?: string;
            results?: Array<{ id: string; distanceMeters: number | null; timeSeconds: number | null }>;
          };
          if (routeResponse.ok && routePayload.status === "ready") {
            const byId = new Map((routePayload.results ?? []).map((result) => [result.id, result]));
            routedPlaces = nearestCandidates.map((place) => {
              const result = byId.get(place.id);
              return {
                ...place,
                routeDistanceMeters: result?.distanceMeters ?? null,
                routeTimeSeconds: result?.timeSeconds ?? null
              };
            });
            routingStatus = "ready";
          }
        } catch (error) {
          if (controller.signal.aborted) return;
          routingStatus = "routing-unavailable";
        }

        if (!active) return;
        setAccess({
          status: routingStatus,
          places: nearestByCategory(routedPlaces, routingStatus === "ready")
        });
      } catch (error) {
        if (!active || controller.signal.aborted) return;
        setAccess({
          status: "error",
          places: [],
          message: error instanceof Error ? error.message : "Nearby places could not be loaded."
        });
      }
    }

    void loadNearbyAccess();
    return () => {
      active = false;
      controller.abort();
    };
  }, [selectedArea.upi, selectedArea.name, selectedArea.district, latitude, longitude]);

  const priceLabel = priceStatus === "published"
    ? "Published price"
    : priceStatus === "estimated"
      ? "Estimated price"
      : "Price missing";

  return (
    <section aria-label="Parcel data confidence and road access" className={styles.inlinePanel}>
      <div className={styles.sectionHeading}>
        <div>
          <h3>Data confidence</h3>
          <p>Source coverage and price basis, shown separately.</p>
        </div>
        <span className={styles.confidenceChip}>
          {hasCadastralRecord ? "Source record" : "Source unclear"}
        </span>
      </div>

      <div className={styles.confidenceRows}>
        <div><span>Parcel record</span><strong>{hasCadastralRecord ? "Published cadastral layer" : "Not confirmed"}</strong></div>
        <div><span>Price basis</span><strong>{priceLabel}</strong></div>
        <div><span>Coverage</span><strong>{coverageStatus}</strong></div>
        <div><span>Zoning</span><strong>{zoning.label}</strong></div>
      </div>
      {missing.length > 0 ? (
        <p className={styles.missingData}>Missing or unresolved: {missing.join(", ")}.</p>
      ) : null}
      <p className={styles.legalNote}>
        A mapped parcel is not proof of title, a verified sale listing, or legal road access.
      </p>

      <div className={styles.compareActionRow}>
        <button
          className={styles.addCompareButton}
          disabled={alreadyAdded || comparisonItems.length >= 4}
          onClick={() => onAddToComparison(comparisonItem)}
          type="button"
        >
          {alreadyAdded ? "Added to comparison" : comparisonItems.length >= 4 ? "4-parcel limit reached" : "Add parcel to comparison"}
        </button>
        <span>{comparisonItems.length}/4 saved</span>
      </div>

      <div className={styles.accessSection}>
        <div className={styles.sectionHeading}>
          <div>
            <h3>Nearby road access</h3>
            <p>Schools, healthcare and public transport.</p>
          </div>
          {access.status === "ready" ? <span className={styles.routeChip}>Road routes</span> : null}
        </div>
        {access.status === "loading" || access.status === "idle" ? (
          <p className={styles.accessMessage} role="status">Checking nearby mapped places and road routes…</p>
        ) : access.status === "error" ? (
          <p className={styles.accessMessage} role="status">Nearby places could not be checked. {access.message ?? ""}</p>
        ) : access.status === "no-places" ? (
          <p className={styles.accessMessage}>No mapped school, healthcare facility or transport stop was returned nearby. OpenStreetMap coverage may be incomplete.</p>
        ) : (
          <>
            <div className={styles.nearbyList}>
              {access.places.map((place) => (
                <div className={styles.nearbyItem} key={place.id}>
                  <span className={styles.nearbyCategory}>
                    {place.category === "school" ? "School" : place.category === "healthcare" ? "Healthcare" : "Transport"}
                  </span>
                  <div className={styles.nearbyName}>
                    <strong>{place.name}</strong>
                    {access.status === "ready" && place.routeDistanceMeters !== null ? (
                      <small>
                        {formatRouteDistance(place.routeDistanceMeters)}
                        {place.routeTimeSeconds !== null ? " · " + formatDriveTime(place.routeTimeSeconds) : " by road"}
                      </small>
                    ) : access.status === "ready" ? (
                      <small>No mapped driving route returned</small>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
            {access.status === "routing-unavailable" ? (
              <p className={styles.accessMessage}>
                Route distance and travel time are withheld because Valhalla is not configured or did not respond. Nearby place names alone do not confirm access.
              </p>
            ) : (
              <p className={styles.accessFootnote}>
                Driving-model estimate over mapped roads, not live traffic. The route starts from the parcel extent midpoint, not a surveyed entrance. Place coverage may be incomplete.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}

type ComparisonPanelProps = {
  open: boolean;
  items: ParcelComparisonItem[];
  onClose: () => void;
  onRemove: (id: string) => void;
};

function bestMetricIds(items: ParcelComparisonItem[], key: "askingPrice" | "pricePerM2" | "areaM2", direction: "min" | "max"): Set<string> {
  const values = items
    .filter((item) => typeof item[key] === "number" && Number.isFinite(item[key]) && (item[key] as number) > 0)
    .map((item) => ({ id: item.id, value: item[key] as number }));
  if (values.length < 2) return new Set();
  const best = direction === "min"
    ? Math.min(...values.map((entry) => entry.value))
    : Math.max(...values.map((entry) => entry.value));
  return new Set(values.filter((entry) => Math.abs(entry.value - best) < 0.000001).map((entry) => entry.id));
}

function MetricCell({
  value,
  isBest,
  bestLabel
}: {
  value: string;
  isBest: boolean;
  bestLabel: string;
}) {
  return (
    <td>
      <span>{value}</span>
      {isBest ? <span aria-label={bestLabel} className={styles.bestStar} title={bestLabel}>★</span> : null}
    </td>
  );
}

export function ParcelComparisonPanel({ open, items, onClose, onRemove }: ComparisonPanelProps) {
  if (!open) return null;

  const bestAskingPrice = bestMetricIds(items, "askingPrice", "min");
  const bestUnitPrice = bestMetricIds(items, "pricePerM2", "min");
  const largestArea = bestMetricIds(items, "areaM2", "max");

  return (
    <aside aria-label="Parcel comparison scorecard" aria-modal="false" className={styles.comparisonPanel}>
      <div className={styles.panelHeader}>
        <div>
          <p>LAND INTELLIGENCE</p>
          <h2>Parcel comparison</h2>
          <span>Compare up to four records. No overall winner is assigned.</span>
        </div>
        <button aria-label="Close parcel comparison" className={styles.closeButton} onClick={onClose} type="button">×</button>
      </div>

      {items.length === 0 ? (
        <div className={styles.emptyState}>
          <strong>No parcels saved yet</strong>
          <p>Select a parcel on the map and choose “Add parcel to comparison”.</p>
        </div>
      ) : (
        <>
          <div className={styles.tableScroll}>
            <table className={styles.scorecard}>
              <thead>
                <tr>
                  <th scope="col">Metric</th>
                  {items.map((item) => (
                    <th key={item.id} scope="col">
                      <strong>{item.name}</strong>
                      <small>{item.locationLabel || item.district}</small>
                      <button className={styles.removeButton} onClick={() => onRemove(item.id)} type="button">
                        Remove
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Asking price</th>
                  {items.map((item) => (
                    <MetricCell
                      bestLabel="Lowest available asking price"
                      isBest={bestAskingPrice.has(item.id)}
                      key={item.id}
                      value={formatMoney(item.askingPrice)}
                    />
                  ))}
                </tr>
                <tr>
                  <th scope="row">Price per m²</th>
                  {items.map((item) => (
                    <MetricCell
                      bestLabel="Lowest available price per square metre"
                      isBest={bestUnitPrice.has(item.id)}
                      key={item.id}
                      value={formatRate(item.pricePerM2)}
                    />
                  ))}
                </tr>
                <tr>
                  <th scope="row">Parcel size</th>
                  {items.map((item) => (
                    <MetricCell
                      bestLabel="Largest available parcel area"
                      isBest={largestArea.has(item.id)}
                      key={item.id}
                      value={formatArea(item.areaM2, item.areaIsEstimate)}
                    />
                  ))}
                </tr>
                <tr>
                  <th scope="row">Zoning</th>
                  {items.map((item) => (
                    <td key={item.id}>{item.zoning}</td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Price basis</th>
                  {items.map((item) => (
                    <td key={item.id}>{item.priceStatus === "published" ? "Published" : item.priceStatus === "estimated" ? "Estimated" : "Missing"}</td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Data confidence</th>
                  {items.map((item) => (
                    <td key={item.id}>
                      <span>{item.coverageStatus}</span>
                      {item.sourceLabel ? <small className={styles.sourceText}>{item.sourceLabel}</small> : null}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <p className={styles.scorecardNote}>
            ★ marks the lowest asking price, lowest price per m², or largest area among available values. Ties can share a star. Zoning is not ranked because suitability depends on the intended use. Missing values are not scored as poor results.
          </p>
        </>
      )}
    </aside>
  );
}
