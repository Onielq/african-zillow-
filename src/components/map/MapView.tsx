"use client";

import { useEffect, useRef } from "react";
import {
  AttributionControl,
  Map as MapLibreMap,
  NavigationControl,
  ScaleControl,
  type GeoJSONSource,
  type Map as MapLibreMapInstance,
  type MapGeoJSONFeature,
  type StyleSpecification,
  getVersion,
  setWorkerUrl
} from "maplibre-gl";
import type { FeatureCollection, Geometry } from "geojson";
import { formatCompactValue } from "@/lib/format-compact-value";
import { calculateParcelAskingPrice } from "@/lib/parcel-pricing";

// Next.js 16 defaults to Turbopack. Serve both MapLibre worker modules from
// the same versioned public directory so the worker can resolve its sibling.
const mapLibreVersion = getVersion();
setWorkerUrl(`/vendor/maplibre-gl/${mapLibreVersion}/maplibre-gl-worker.mjs?v=${mapLibreVersion}`);

export type BasemapStatus = "loading" | "ready" | "error";
export type BoundaryStatus = "loading" | "ready" | "error";
export type BasemapMode = "map" | "satellite" | "hybrid";
export type AreaLevel = "district" | "sector" | "cell" | "village" | "parcel";

export type ParcelPriceType =
  | "calculated-asking-price"
  | "indicative-estimate"
  | "confirmed-asking-price"
  | "recorded-sale-price"
  | "formal-valuation";

export function isParcelPriceType(value: unknown): value is ParcelPriceType {
  return value === "calculated-asking-price" ||
    value === "indicative-estimate" ||
    value === "confirmed-asking-price" ||
    value === "recorded-sale-price" ||
    value === "formal-valuation";
}

export function parcelPriceTypeLabel(type: ParcelPriceType): string {
  switch (type) {
    case "calculated-asking-price":
      return "Asking price";
    case "indicative-estimate":
      return "Indicative estimated value";
    case "confirmed-asking-price":
      return "Confirmed asking price";
    case "recorded-sale-price":
      return "Recorded sale price";
    case "formal-valuation":
      return "Formal valuation";
  }
}

export type MapOverlayCategory = "landmarks" | "healthEducation" | "transportation" | "nature";
export type MapMetric =
  | "averageLandPricePerM2"
  | "transactionVolume"
  | "capitalAppreciation"
  | "rentalYield"
  | "marketSupply"
  | "upcomingSupply";

type MetricBubbleValue = {
  level: Exclude<AreaLevel, "parcel">;
  district: string;
  sector: string | null;
  cell: string | null;
  village: string | null;
  estimate: number;
  label: string;
  status: string;
  method: string;
};
export type ShowScope = "kigali" | "bugesera" | "pilot";

export type ParcelZoningEntry = {
  code: string | null;
  name: string;
  condition: string | null;
  prohibited: string | null;
  buffer: string | null;
  /** True when a single published source record explicitly lists multiple zone codes together. */
  sourceListsMultipleCodes?: boolean;
};
export type ParcelZoningStatus = "loading" | "found" | "not-covered" | "error" | "unavailable";

export type SelectedArea = {
  level: AreaLevel;
  name: string;
  province: string | null;
  district: string;
  districtId: string | null;
  sector: string | null;
  sectorId: string | null;
  cell: string | null;
  cellId: string | null;
  village: string | null;
  villageId: string | null;
  averageLandPricePerM2: number | null;
  averageLandPriceKind?: string | null;
  averageLandPriceSampleSize?: number | null;
  averageLandPriceConflictingCells?: number | null;
  sourceLabel?: string | null;
  sourceType?: "administrative-boundary" | "cadastral-parcel";
  developerName?: string | null;
  upi?: string | null;
  parcelNumber?: string | null;
  parcelSizeM2?: number | null;
  parcelSizeSource?: "cadastral-attribute" | "geometry-estimate" | null;
  parcelPriceType?: ParcelPriceType | null;
  parcelPriceValue?: number | null;
  parcelPriceSource?: string | null;
  parcelPriceDate?: string | null;
  parcelPriceNote?: string | null;
  wetlandAreaM2?: number | null;
  lastUpdatedOn?: number | null;
  bounds?: [number, number, number, number] | null;
  /** Bounding-box center used as a routing start point; the routing engine snaps to the road graph. */
  center?: [number, number] | null;
  parcelMarketStatus?: PropertyMarketStatus | null;
  parcelMarketStatusSource?: "source" | null;
  zoning?: ParcelZoningEntry[] | null;
  zoningStatus?: ParcelZoningStatus | null;
  zoningSource?: string | null;
};

type AreaProperties = {
  province?: string | null;
  province_id?: string | null;
  district?: string | null;
  district_id?: string | null;
  sector?: string | null;
  sector_id?: string | null;
  cell?: string | null;
  cell_id?: string | null;
  village?: string | null;
  village_id?: string | null;
  average_land_price_per_m2?: number | null;
  average_land_price_source?: string | null;
  average_land_price_date_status?: string | null;
  source_label?: string | null;
  source_type?: string | null;
  developer_name?: string | null;
  developerName?: string | null;
  upi?: string | null;
  parcel_number?: string | null;
  parcel_size_m2?: number | null;
  parcel_price_type?: ParcelPriceType | null;
  parcel_price_value?: number | null;
  parcel_price_source?: string | null;
  parcel_price_date?: string | null;
  parcel_price_note?: string | null;
  wetland_area_m2?: number | null;
  last_updated_on?: number | null;
  average_land_price_kind?: string | null;
  average_land_price_sample_size?: number | null;
  average_land_price_conflicting_cells?: number | null;
  overlay_category?: MapOverlayCategory | null;
  name?: string | null;
  detail?: string | null;
  source_id?: string | number | null;
  zoning?: string | null;
  zoning_source?: string | null;
  label?: string | null;
  has_value?: boolean;
  icon_image?: string;
  pill_width?: number;
  pill_height?: number;
  show_dot?: boolean;
  metric_label?: string | null;
  metric_status?: string | null;
  metric_detail?: string | null;
  market_status?: PropertyMarketStatus | null;
  market_status_source?: "source" | null;
  listing_created_at?: string | number | null;
  is_selected?: boolean;
  is_new_listing?: boolean;
  level?: AreaLevel;
  area_feature_id?: string | null;
};

type MapFeatureCollection = FeatureCollection<Geometry, AreaProperties>;
type AdminSourceId = "kigali" | "bugesera";
type ViewBounds = [number, number, number, number];
const PARCEL_OUTLINE_CASING_LAYER = "parcel-outline-casing";

const ADMIN_SOURCE_EXTENTS: Record<AdminSourceId, ViewBounds> = {
  kigali: [29.58, -2.12, 30.32, -1.47],
  bugesera: [29.82, -2.62, 30.56, -1.92]
};

// Outward-rounded request windows let nearby pans reuse the same response
// without simplifying polygon vertices or trimming a boundary to the viewport.
const AREA_QUERY_GRIDS: Record<AreaLevel, number> = {
  district: 0.25,
  sector: 0.05,
  cell: 0.02,
  village: 0.008,
  parcel: 0.002
};

function boundsIntersect(a: ViewBounds, b: ViewBounds): boolean {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

function boundsContain(outer: ViewBounds, inner: ViewBounds): boolean {
  const epsilon = 0.000001;
  return (
    outer[0] <= inner[0] + epsilon &&
    outer[1] <= inner[1] + epsilon &&
    outer[2] >= inner[2] - epsilon &&
    outer[3] >= inner[3] - epsilon
  );
}

function requestBoundsForArea(bounds: ViewBounds, level: AreaLevel): ViewBounds {
  const grid = AREA_QUERY_GRIDS[level];
  return [
    Math.floor(bounds[0] / grid) * grid,
    Math.floor(bounds[1] / grid) * grid,
    Math.ceil(bounds[2] / grid) * grid,
    Math.ceil(bounds[3] / grid) * grid
  ].map((value) => Number(value.toFixed(6))) as ViewBounds;
}

function normalizeMetricKeyPart(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en");
}

function normalizedMetricKey(...parts: unknown[]): string {
  return parts.map(normalizeMetricKeyPart).join("|");
}

type PropertyMarketStatus = "available" | "off-market";

const RECENT_LISTING_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

function propertyMarketStatus(value: unknown): PropertyMarketStatus | null {
  const normalized = typeof value === "string"
    ? value.trim().toLowerCase().replace(/[ _]+/g, "-")
    : "";
  if (normalized === "available") return "available";
  if (normalized === "off-market" || normalized === "offmarket") return "off-market";
  return null;
}

/** Only listing-feed dates qualify here; cadastral update timestamps are not listing dates. */
function isRecentlyListed(value: unknown, now = Date.now()): boolean {
  let timestamp: number;
  if (typeof value === "number" && Number.isFinite(value)) {
    timestamp = value < 1_000_000_000_000 ? value * 1000 : value;
  } else if (typeof value === "string" && value.trim()) {
    const normalized = value.trim();
    if (/^\d+(?:\.\d+)?$/.test(normalized)) {
      const numeric = Number(normalized);
      timestamp = numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
    } else {
      timestamp = Date.parse(normalized);
    }
  } else {
    return false;
  }

  const age = now - timestamp;
  return Number.isFinite(timestamp) && age >= 0 && age <= RECENT_LISTING_WINDOW_MS;
}

type MetricPillVariant = "area" | "parcel";

type MetricPillDimensions = {
  width: number;
  height: number;
  bodyHeight: number;
  tailHeight: number;
  font: string;
  isNewListing: boolean;
};

const metricPillDimensionsCache = new Map<string, MetricPillDimensions>();

function metricPillImageName(
  label: string,
  variant: MetricPillVariant,
  marketStatus: PropertyMarketStatus | null,
  isSelected: boolean,
  isNewListing: boolean
): string {
  let hash = 5381;
  for (let index = 0; index < label.length; index += 1) {
    hash = (Math.imul(hash, 33) ^ label.charCodeAt(index)) >>> 0;
  }
  const state = isSelected ? "selected" : marketStatus ?? "default";
  return "metric-price-pill-" + variant + "-" + state + "-" +
    (isNewListing ? "new-" : "standard-") + hash.toString(36);
}

function measureMetricPill(
  label: string,
  variant: MetricPillVariant,
  isNewListing = false
): MetricPillDimensions {
  const cacheKey = variant + "|" + label + "|" + (isNewListing ? "new" : "standard");
  const cached = metricPillDimensionsCache.get(cacheKey);
  if (cached) return cached;

  const isParcel = variant === "parcel";
  const font = isParcel
    ? isNewListing ? "700 10px Arial, sans-serif" : "700 11px Arial, sans-serif"
    : "600 11px Arial, sans-serif";
  const bodyHeight = isParcel ? (isNewListing ? 27 : 20) : 22;
  const tailHeight = isParcel ? 5 : 0;
  const measureCanvas = document.createElement("canvas");
  const measureContext = measureCanvas.getContext("2d");
  const measuredTextWidth = (() => {
    if (!measureContext) return label.length * (isParcel ? 6 : 6.5);
    measureContext.font = font;
    return Math.ceil(measureContext.measureText(label).width);
  })();
  const measuredWidth = measuredTextWidth + (isParcel ? 6 : 16);
  const width = isParcel ? 39 : Math.max(34, measuredWidth);
  const dimensions = {
    width,
    height: bodyHeight + tailHeight,
    bodyHeight,
    tailHeight,
    font,
    isNewListing
  };
  metricPillDimensionsCache.set(cacheKey, dimensions);
  return dimensions;
}

function ensureMetricPillImage(
  map: MapLibreMapInstance,
  label: string,
  variant: MetricPillVariant,
  dimensions: MetricPillDimensions,
  marketStatus: PropertyMarketStatus | null = null,
  isSelected = false,
  isNewListing = false
): string {
  const imageName = metricPillImageName(label, variant, marketStatus, isSelected, isNewListing);
  if (map.hasImage(imageName)) return imageName;

  const pixelRatio = 2;
  const { width, height, bodyHeight, tailHeight, font } = dimensions;
  const canvas = document.createElement("canvas");
  canvas.width = width * pixelRatio;
  canvas.height = height * pixelRatio;
  const context = canvas.getContext("2d");
  if (!context) return "";

  context.scale(pixelRatio, pixelRatio);
  const fillColor = isSelected
    ? ["#2563EB", "#1D4ED8"]
    : variant === "parcel" && marketStatus === "available"
      ? ["#D41A3A", "#B8142E"]
      : variant === "parcel" && marketStatus === "off-market"
        ? ["#3A3A42", "#2E2E35"]
        : variant === "parcel"
          ? ["#8B9690", "#748079"]
          : ["#9D2932", "#7F2028"];
  const gradient = context.createLinearGradient(0, 0, 0, bodyHeight);
  gradient.addColorStop(0, fillColor[0]);
  gradient.addColorStop(1, fillColor[1]);
  context.fillStyle = gradient;
  context.shadowColor = isSelected ? "rgba(37, 99, 235, 0.32)" : "rgba(0, 0, 0, 0.15)";
  context.shadowBlur = 4;
  context.shadowOffsetY = 2;

  const radius = variant === "parcel" ? 10 : bodyHeight / 2;
  const tailHalfWidth = 4;
  context.beginPath();
  context.moveTo(radius, 0.5);
  context.lineTo(width - radius, 0.5);
  context.quadraticCurveTo(width - 0.5, 0.5, width - 0.5, radius);
  context.lineTo(width - 0.5, bodyHeight - radius);
  context.quadraticCurveTo(width - 0.5, bodyHeight - 0.5, width - radius, bodyHeight - 0.5);
  if (tailHeight > 0) {
    context.lineTo(width / 2 + tailHalfWidth, bodyHeight - 0.5);
    context.lineTo(width / 2, height - 1);
    context.lineTo(width / 2 - tailHalfWidth, bodyHeight - 0.5);
  }
  context.lineTo(radius, bodyHeight - 0.5);
  context.quadraticCurveTo(0.5, bodyHeight - 0.5, 0.5, bodyHeight - radius);
  context.lineTo(0.5, radius);
  context.quadraticCurveTo(0.5, 0.5, radius, 0.5);
  context.closePath();
  context.fill();

  context.shadowColor = "transparent";
  context.shadowBlur = 0;
  context.shadowOffsetY = 0;
  context.fillStyle = "#FFFFFF";
  context.textAlign = "center";
  context.textBaseline = "middle";
  if (variant === "parcel" && isNewListing) {
    context.font = "700 8px Arial, sans-serif";
    context.fillText("New", width / 2, 7.5, width - 4);
    context.font = "700 10px Arial, sans-serif";
    context.fillText(label, width / 2, 19, width - 4);
  } else {
    context.font = font;
    context.fillText(label, width / 2, bodyHeight / 2, width - 4);
  }
  map.addImage(imageName, context.getImageData(0, 0, canvas.width, canvas.height), { pixelRatio });
  return imageName;
}

type MetricLabelCollisionBox = {
  featureIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Return labels that belong to a collision group of at least three. Pairs are
 * deliberately kept as pills. A screen-space grid keeps the check local and
 * efficient even when the viewport contains many cadastral parcels.
 */
export function findCrowdedMetricLabelIndexes(
  boxes: MetricLabelCollisionBox[],
  minimumCrowdedGroupSize = 3
): Set<number> {
  const neighbours = new Map<number, Set<number>>();
  const buckets = new Map<string, MetricLabelCollisionBox[]>();
  const bucketSize = 64;
  const edgeGap = 2;

  for (const box of boxes) neighbours.set(box.featureIndex, new Set<number>());

  for (const box of boxes) {
    const minX = Math.floor((box.x - box.width / 2 - edgeGap) / bucketSize);
    const maxX = Math.floor((box.x + box.width / 2 + edgeGap) / bucketSize);
    const minY = Math.floor((box.y - box.height / 2 - edgeGap) / bucketSize);
    const maxY = Math.floor((box.y + box.height / 2 + edgeGap) / bucketSize);

    for (let gridX = minX; gridX <= maxX; gridX += 1) {
      for (let gridY = minY; gridY <= maxY; gridY += 1) {
        const key = gridX + ":" + gridY;
        const bucket = buckets.get(key) ?? [];
        for (const other of bucket) {
          const knownNeighbours = neighbours.get(box.featureIndex);
          if (knownNeighbours?.has(other.featureIndex)) continue;
          const overlaps =
            Math.abs(box.x - other.x) < (box.width + other.width) / 2 + edgeGap &&
            Math.abs(box.y - other.y) < (box.height + other.height) / 2 + edgeGap;
          if (!overlaps) continue;
          knownNeighbours?.add(other.featureIndex);
          neighbours.get(other.featureIndex)?.add(box.featureIndex);
        }
        bucket.push(box);
        buckets.set(key, bucket);
      }
    }
  }

  const crowded = new Set<number>();
  const visited = new Set<number>();
  for (const box of boxes) {
    if (visited.has(box.featureIndex)) continue;
    const component: number[] = [];
    const queue = [box.featureIndex];
    visited.add(box.featureIndex);
    while (queue.length > 0) {
      const current = queue.pop() as number;
      component.push(current);
      for (const neighbour of neighbours.get(current) ?? []) {
        if (visited.has(neighbour)) continue;
        visited.add(neighbour);
        queue.push(neighbour);
      }
    }
    if (component.length >= minimumCrowdedGroupSize) {
      for (const featureIndex of component) crowded.add(featureIndex);
    }
  }
  return crowded;
}

function metricPillScaleAtZoom(zoom: number): number {
  if (zoom <= 5) return 0.84;
  if (zoom <= 12) return 0.84 + ((zoom - 5) / 7) * 0.08;
  if (zoom <= 16) return 0.92 + ((zoom - 12) / 4) * 0.08;
  if (zoom <= 19) return 1 + ((zoom - 16) / 3) * 0.02;
  return 1.02;
}

function mergeAreaCollections(collections: MapFeatureCollection[]): MapFeatureCollection {
  return {
    type: "FeatureCollection",
    features: collections.flatMap((collection) => collection.features)
  };
}


type MapViewProps = {
  basemapMode: BasemapMode;
  showLandPriceHeatmap: boolean;
  selectedMetric: MapMetric;
  showLayers: MapOverlayCategory[];
  showZoning: boolean;
  showScope: ShowScope;
  selectedArea: SelectedArea | null;
  onMapReady: (map: MapLibreMapInstance | null) => void;
  onStatusChange: (status: BasemapStatus) => void;
  onBoundaryStatusChange: (status: BoundaryStatus) => void;
  onAreaSelected: (area: SelectedArea | null) => void;
};

const FALLBACK_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

const LAND_PRICE_RAMP = [
  0, "#36B8B2",
  10000, "#79CDA8",
  25000, "#D9D76B",
  40000, "#EF9754",
  65000, "#B7444B"
] as const;

function areaFillColorExpression(showPrice: boolean, baseColor: string, isParcel = false) {
  return [
    "case",
    ["boolean", ["feature-state", "selected"], false], isParcel ? "#00DDF5" : "#FFE3A1",
    ["boolean", ["feature-state", "hover"], false], "#65D5A1",
    showPrice
      ? [
          "case",
          ["has", "average_land_price_per_m2"],
          ["interpolate", ["linear"], ["get", "average_land_price_per_m2"], ...LAND_PRICE_RAMP],
          "#DCE5DD"
        ]
      : baseColor
  ] as never;
}

const AREA_FILL_OPACITY_EXPRESSION = [
  "case",
  ["boolean", ["feature-state", "selected"], false], 0.42,
  ["boolean", ["feature-state", "hover"], false], 0.74,
  0.23
] as never;

function applyShowOverlayFilters(map: MapLibreMapInstance, categories: MapOverlayCategory[]) {
  const categoryFilter = categories.length
    ? ["in", ["get", "overlay_category"], ["literal", categories]]
    : ["==", ["get", "overlay_category"], "__hidden__"];
  const filters: Array<[string, unknown[]]> = [
    ["show-road-casing", ["all", ["in", ["geometry-type"], ["literal", ["LineString", "MultiLineString"]]], ["==", ["get", "overlay_category"], "transportation"], categoryFilter]],
    ["show-road-lines", ["all", ["in", ["geometry-type"], ["literal", ["LineString", "MultiLineString"]]], ["==", ["get", "overlay_category"], "transportation"], categoryFilter]],
    ["show-poi-fill", ["all", ["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]]], categoryFilter]],
    ["show-poi-outline", ["all", ["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]]], categoryFilter]],
    ["show-poi-circles", ["all", ["==", ["geometry-type"], "Point"], categoryFilter]],
    ["show-poi-labels", ["all", ["==", ["geometry-type"], "Point"], ["has", "name"], categoryFilter]]
  ];
  for (const [id, filter] of filters) {
    if (map.getLayer(id)) map.setFilter(id, filter as never);
  }
}
const NORMAL_STYLE_URL =
  process.env.NEXT_PUBLIC_MAP_STYLE_URL?.trim() || FALLBACK_STYLE_URL;

// Approximate geographic envelope of Rwanda with a small safety margin.
// maxBounds constrains panning; a viewport-derived min zoom prevents zooming
// so far out that the full country extent no longer fits on screen.
const RWANDA_CAMERA_BOUNDS: [[number, number], [number, number]] = [
  [28.82, -2.87],
  [30.93, -1.02]
];

// Satellite mode is imagery only. Keep roads in the separate Hybrid mode so
// a failed optional reference overlay cannot make satellite imagery look blank.
const SATELLITE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    "world-imagery": {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256, minzoom: 0, maxzoom: 23,
      attribution: "Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community"
    }
  },
  layers: [
    // The service publishes imagery through z23. Keep the layer visible to
    // parcel zoom and let MapLibre overzoom only above the provider's max zoom.
    { id: "world-imagery", type: "raster", source: "world-imagery", minzoom: 0, maxzoom: 24 }
  ]
};

const HYBRID_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    "world-imagery": {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256, minzoom: 0, maxzoom: 19,
      attribution: "Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community"
    },
    "world-transportation": {
      type: "raster",
      tiles: ["https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256, minzoom: 0, maxzoom: 19,
      attribution: "Transportation © Esri, HERE, Garmin, and OpenStreetMap contributors"
    }
  },
  layers: [
    // Keep hybrid imagery and road references visible above z19 by overzooming
    // their last available raster tiles at individual-parcel scale.
    { id: "world-imagery", type: "raster", source: "world-imagery", minzoom: 0, maxzoom: 24 },
    { id: "world-transportation", type: "raster", source: "world-transportation", minzoom: 0, maxzoom: 24 }
  ]
};

// Administrative boundaries are real geographic polygons, not routes.
// The thresholds reveal one progressively finer level at a time.
// The click-to-fit zooms below aim to bring each parent polygon close to
// the usable map viewport before showing its children: district → sector,
// sector → cell, then selected-cell parcel outlines.
const SECTOR_ZOOM = 12.0;
const CELL_ZOOM = 15.1;
// Keep every requested geography level visible in sequence before individual plots.
const VILLAGE_ZOOM = 16.2;
const PARCEL_ZOOM = 17.0;

const AREA_LEVELS: AreaLevel[] = ["district", "sector", "cell", "village", "parcel"];

const AREA_LAYERS: Record<
  AreaLevel,
  {
    source: string;
    fill: string;
    outline: string;
    label: string;
    property: "district" | "sector" | "cell" | "village" | "parcel_number";
    minZoom: number;
    color: string;
  }
> = {
  district: {
    source: "admin-districts",
    fill: "district-fill",
    outline: "district-outline",
    label: "district-label",
    property: "district",
    minZoom: 5,
    color: "#DCEAE1"
  },
  sector: {
    source: "admin-sectors",
    fill: "sector-fill",
    outline: "sector-outline",
    label: "sector-label",
    property: "sector",
    minZoom: SECTOR_ZOOM,
    color: "#D4E8DD"
  },
  cell: {
    source: "admin-cells",
    fill: "cell-fill",
    outline: "cell-outline",
    label: "cell-label",
    property: "cell",
    minZoom: CELL_ZOOM,
    color: "#D7E7F0"
  },
  village: {
    source: "admin-villages",
    fill: "village-fill",
    outline: "village-outline",
    label: "village-label",
    property: "village",
    minZoom: VILLAGE_ZOOM,
    color: "#F0E4C9"
  },
  parcel: {
    source: "land-parcels",
    fill: "parcel-fill",
    outline: "parcel-outline",
    label: "parcel-label",
    property: "parcel_number",
    minZoom: PARCEL_ZOOM,
    color: "#E9B65B"
  }
};

function activeAreaLevel(zoom: number): AreaLevel {
  if (zoom >= PARCEL_ZOOM) return "parcel";
  if (zoom >= VILLAGE_ZOOM) return "village";
  if (zoom >= CELL_ZOOM) return "cell";
  if (zoom >= SECTOR_ZOOM) return "sector";
  return "district";
}

function zoomForLevel(level: AreaLevel): number {
  switch (level) {
    case "district":
      return 12.0;
    case "sector":
      return 15.0;
    case "cell":
      return 16.0;
    case "village":
      // Keep the village view below the parcel-layer activation threshold.
      return 16.6;
    case "parcel":
      return 19.35;
  }
}

function emptyFeatureCollection(): MapFeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

function getFeatureId(feature: MapGeoJSONFeature): string | number | null {
  const id = feature.id;
  return typeof id === "string" || typeof id === "number" ? id : null;
}

function collectPositions(value: unknown, output: Array<[number, number]>) {
  if (!Array.isArray(value)) return;

  if (
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  ) {
    output.push([value[0], value[1]]);
    return;
  }

  for (const child of value) collectPositions(child, output);
}

const EARTH_RADIUS_METRES = 6_371_008.8;

function ringAreaM2(ring: number[][]): number {
  if (ring.length < 3) return 0;
  let sum = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const next = (index + 1) % ring.length;
    const longitude1 = (ring[index][0] ?? 0) * Math.PI / 180;
    const latitude1 = (ring[index][1] ?? 0) * Math.PI / 180;
    const longitude2 = (ring[next][0] ?? 0) * Math.PI / 180;
    const latitude2 = (ring[next][1] ?? 0) * Math.PI / 180;
    sum += (longitude2 - longitude1) * (2 + Math.sin(latitude1) + Math.sin(latitude2));
  }
  return Math.abs(sum) * EARTH_RADIUS_METRES * EARTH_RADIUS_METRES / 2;
}

function polygonAreaM2(rings: number[][][]): number {
  if (rings.length === 0) return 0;
  const outerArea = ringAreaM2(rings[0]);
  const holeArea = rings.slice(1).reduce((sum, ring) => sum + ringAreaM2(ring), 0);
  return Math.max(0, outerArea - holeArea);
}

/**
 * Use the published parcel polygon to estimate area when the GIS size field is
 * absent. It is a geometry-derived estimate, not an official cadastral area.
 */
function geometryAreaM2(geometry: Geometry): number | null {
  let area = 0;
  if (geometry.type === "Polygon") {
    area = polygonAreaM2(geometry.coordinates as unknown as number[][][]);
  } else if (geometry.type === "MultiPolygon") {
    area = (geometry.coordinates as unknown as number[][][][])
      .reduce((sum, polygon) => sum + polygonAreaM2(polygon), 0);
  } else {
    return null;
  }
  return Number.isFinite(area) && area > 0 ? area : null;
}

function fitFeature(
  map: MapLibreMapInstance,
  feature: MapGeoJSONFeature,
  level: AreaLevel
) {
  const positions: Array<[number, number]> = [];
  if (!("coordinates" in feature.geometry)) return;
  collectPositions(feature.geometry.coordinates, positions);
  if (positions.length === 0) return;

  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;

  for (const [longitude, latitude] of positions) {
    west = Math.min(west, longitude);
    south = Math.min(south, latitude);
    east = Math.max(east, longitude);
    north = Math.max(north, latitude);
  }

  if (![west, south, east, north].every(Number.isFinite)) return;

  const mobile = window.matchMedia("(max-width: 720px)").matches;
  const padding = mobile
    ? { top: 154, bottom: 145, left: 20, right: 20 }
    : { top: 118, bottom: 78, left: 336, right: 78 };

  map.fitBounds(
    [
      [west, south],
      [east, north]
    ],
    {
      padding,
      maxZoom: zoomForLevel(level),
      duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? 0
        : 620
    }
  );
}

function featureBounds(feature: MapGeoJSONFeature): [number, number, number, number] | null {
  const positions: Array<[number, number]> = [];
  if (!("coordinates" in feature.geometry)) return null;
  collectPositions(feature.geometry.coordinates, positions);
  if (positions.length === 0) return null;
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const [longitude, latitude] of positions) {
    west = Math.min(west, longitude);
    south = Math.min(south, latitude);
    east = Math.max(east, longitude);
    north = Math.max(north, latitude);
  }
  return [west, south, east, north].every(Number.isFinite)
    ? [west, south, east, north]
    : null;
}

function featureToArea(
  feature: MapGeoJSONFeature,
  level: AreaLevel
): SelectedArea | null {
  const properties = feature.properties as AreaProperties | null;
  if (!properties?.district) return null;

  const name = level === "parcel"
    ? properties.parcel_number
      ? `Parcel ${properties.parcel_number}`
      : properties.upi
        ? `Parcel ${properties.upi}`
        : null
    : properties[level] ?? null;
  if (!name) return null;

  return {
    level,
    name,
    province: properties.province ?? null,
    district: properties.district,
    districtId: properties.district_id ?? null,
    sector: properties.sector ?? null,
    sectorId: properties.sector_id ?? null,
    cell: properties.cell ?? null,
    cellId: properties.cell_id ?? null,
    village: properties.village ?? null,
    villageId: properties.village_id ?? null,
    averageLandPricePerM2:
      typeof properties.average_land_price_per_m2 === "number"
        ? properties.average_land_price_per_m2
        : null,
    averageLandPriceKind: properties.average_land_price_kind ?? null,
    averageLandPriceSampleSize: properties.average_land_price_sample_size ?? null,
    averageLandPriceConflictingCells: properties.average_land_price_conflicting_cells ?? null,
    sourceLabel: properties.source_label ?? null,
    sourceType: properties.source_type === "cadastral-parcel"
      ? "cadastral-parcel"
      : "administrative-boundary",
    developerName: properties.developer_name ?? properties.developerName ?? null,
    upi: properties.upi ?? null,
    parcelNumber: properties.parcel_number ?? null,
    parcelSizeM2:
      typeof properties.parcel_size_m2 === "number" && properties.parcel_size_m2 > 0
        ? properties.parcel_size_m2
        : level === "parcel"
          ? geometryAreaM2(feature.geometry as Geometry)
          : null,
    parcelSizeSource:
      typeof properties.parcel_size_m2 === "number" && properties.parcel_size_m2 > 0
        ? "cadastral-attribute"
        : level === "parcel" && geometryAreaM2(feature.geometry as Geometry) !== null
          ? "geometry-estimate"
          : null,
    parcelPriceType: isParcelPriceType(properties.parcel_price_type) ? properties.parcel_price_type : null,
    parcelPriceValue: typeof properties.parcel_price_value === "number" ? properties.parcel_price_value : null,
    parcelPriceSource: properties.parcel_price_source ?? null,
    parcelPriceDate: properties.parcel_price_date ?? null,
    parcelPriceNote: properties.parcel_price_note ?? null,
    wetlandAreaM2: properties.wetland_area_m2 ?? null,
    lastUpdatedOn: properties.last_updated_on ?? null,
    bounds: featureBounds(feature),
    center: (() => {
      const box = featureBounds(feature);
      return box ? [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2] as [number, number] : null;
    })()
  };
}

export function MapView({
  basemapMode,
  showLandPriceHeatmap,
  selectedMetric,
  showZoning,
  onMapReady,
  onStatusChange,
  onBoundaryStatusChange,
  onAreaSelected,
  showLayers,
  showScope,
  selectedArea
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMapInstance | null>(null);
  const activeBasemapModeRef = useRef<BasemapMode>("map");
  const basemapTileErrorRef = useRef(false);
  const basemapStyleSequenceRef = useRef(0);
  const showLandPriceHeatmapRef = useRef(showLandPriceHeatmap);
  const selectedMetricRef = useRef<MapMetric>(selectedMetric);
  const metricBubbleValuesRef = useRef<MetricBubbleValue[]>([]);
  const areaDataRef = useRef<Partial<Record<AreaLevel, MapFeatureCollection>>>({});
  const selectedAreaRef = useRef<SelectedArea | null>(selectedArea);
  const selectionSyncRef = useRef<((area: SelectedArea | null) => void) | null>(null);
  const refreshMetricBubblesRef = useRef<(() => void) | null>(null);
  const showLayersRef = useRef(showLayers);
  const showScopeRef = useRef(showScope);
  const showZoningRef = useRef(showZoning);
  const refreshShowOverlaysRef = useRef<(() => void) | null>(null);
  const refreshZoningRef = useRef<(() => void) | null>(null);

  // Change only the style, not the map instance. Camera position and the
  // administrative zoom hierarchy therefore remain connected to the same map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || activeBasemapModeRef.current === basemapMode) return;

    activeBasemapModeRef.current = basemapMode;
    basemapTileErrorRef.current = false;
    basemapStyleSequenceRef.current += 1;
    onStatusChange("loading");

    map.setStyle(basemapMode === "map"
          ? NORMAL_STYLE_URL
          : basemapMode === "satellite"
            ? SATELLITE_STYLE
            : HYBRID_STYLE);
  }, [basemapMode, onStatusChange]);

  useEffect(() => {
    selectedMetricRef.current = selectedMetric;
    const currentMap = mapRef.current;
    if (currentMap?.isStyleLoaded() && currentMap.getLayer(AREA_LAYERS.parcel.label)) {
      const showParcelNumber =
        activeAreaLevel(currentMap.getZoom()) === "parcel" &&
        selectedMetric !== "averageLandPricePerM2";
      currentMap.setLayoutProperty(
        AREA_LAYERS.parcel.label,
        "visibility",
        showParcelNumber ? "visible" : "none"
      );
    }
    let active = true;
    const loadMetricBubbleValues = async () => {
      if (selectedMetric !== "transactionVolume") {
        metricBubbleValuesRef.current = [];
        refreshMetricBubblesRef.current?.();
        return;
      }
      try {
        const response = await fetch("/api/geography/metric-bubbles");
        if (!response.ok) throw new Error("Map metric bubble request failed (" + response.status + ")");
        const payload = await response.json() as { values?: MetricBubbleValue[] };
        if (!active) return;
        metricBubbleValuesRef.current = payload.values ?? [];
      } catch (error) {
        if (!active) return;
        metricBubbleValuesRef.current = [];
        console.error("Map transaction-volume bubbles are unavailable.", error);
      }
      if (active) refreshMetricBubblesRef.current?.();
    };
    void loadMetricBubbleValues();
    refreshMetricBubblesRef.current?.();
    return () => { active = false; };
  }, [selectedMetric]);

  useEffect(() => {
    selectedAreaRef.current = selectedArea;
    selectionSyncRef.current?.(selectedArea);
  }, [selectedArea]);

  useEffect(() => {
    showLandPriceHeatmapRef.current = showLandPriceHeatmap;
    const map = mapRef.current;
    if (!map) return;
    for (const level of ["district", "sector", "cell"] as const) {
      const layer = AREA_LAYERS[level];
      if (!map.getLayer(layer.fill)) continue;
      map.setPaintProperty(layer.fill, "fill-color", areaFillColorExpression(showLandPriceHeatmap, layer.color));
      map.setPaintProperty(layer.fill, "fill-opacity", AREA_FILL_OPACITY_EXPRESSION);
    }
  }, [showLandPriceHeatmap]);

  useEffect(() => {
    showLayersRef.current = showLayers;
    showScopeRef.current = showScope;
    const map = mapRef.current;
    if (!map) return;
    applyShowOverlayFilters(map, showLayers);
    refreshShowOverlaysRef.current?.();
  }, [showLayers, showScope]);

  useEffect(() => {
    showZoningRef.current = showZoning;
    refreshZoningRef.current?.();
  }, [showZoning]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    onStatusChange("loading");
    onBoundaryStatusChange("loading");

    const initialStyleUrl = NORMAL_STYLE_URL;

    const map = new MapLibreMap({
      container,
      style: initialStyleUrl,
      center: [30.13, -2.1],
      zoom: 8.35,
      minZoom: 5,
      maxZoom: 20,
      maxBounds: RWANDA_CAMERA_BOUNDS,
      pitch: 0,
      bearing: 0,
      maxPitch: 0,
      dragRotate: false,
      pitchWithRotate: false,
      renderWorldCopies: false,
      attributionControl: false,
      fadeDuration: 180
    });

    map.addControl(
      new NavigationControl({ showCompass: true, visualizePitch: false }),
      "bottom-right"
    );
    map.addControl(new ScaleControl({ unit: "metric", maxWidth: 120 }), "bottom-left");
    map.addControl(
      new AttributionControl({ compact: false }),
      "bottom-left"
    );

    mapRef.current = map;
    activeBasemapModeRef.current = "map";

    // Read-only browser smoke-test hook. It is enabled only for an explicit
    // e2e query parameter and is removed when this map instance is disposed.
    const e2eMapWindow = window as Window & {
      __RLI_E2E_MAP__?: MapLibreMapInstance;
      __RLI_E2E_TRACE__?: Array<Record<string, unknown>>;
    };
    const e2eEnabled = new URLSearchParams(window.location.search).get("rli_e2e") === "1";
    const recordE2ETrace = (event: string, details: Record<string, unknown> = {}) => {
      if (!e2eEnabled) return;
      const trace = e2eMapWindow.__RLI_E2E_TRACE__ ?? [];
      trace.push({ event, at: new Date().toISOString(), ...details });
      e2eMapWindow.__RLI_E2E_TRACE__ = trace;
    };
    if (e2eEnabled) e2eMapWindow.__RLI_E2E_MAP__ = map;

    const updateRwandaZoomFloor = () => {
      const mobile = window.matchMedia("(max-width: 720px)").matches;
      const camera = map.cameraForBounds(RWANDA_CAMERA_BOUNDS, {
        padding: mobile ? 18 : 36
      });

      if (typeof camera?.zoom === "number" && Number.isFinite(camera.zoom)) {
        map.setMinZoom(Math.max(5, camera.zoom));
      }
    };

    // Calculate the widest zoom-out that still fits Rwanda in the current
    // viewport. Recalculate on resize so the rule also works on mobile.
    updateRwandaZoomFloor();

    let styleLoaded = false;
    let fallbackAttempted = initialStyleUrl === FALLBACK_STYLE_URL;
    let layerInteractionsAttached = false;
    let viewportListenersAttached = false;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    let basemapReadyTimer: ReturnType<typeof setTimeout> | null = null;
    let parcelRefreshRetryTimer: ReturnType<typeof setTimeout> | null = null;
    let lastParcelRetryKey: string | null = null;
    let parcelRetryCountForKey = 0;
    let activeController: AbortController | null = null;
    let activeRefreshKey: string | null = null;
    let refreshSequence = 0;
    const areaCache = new Map<string, { bounds: ViewBounds; data: MapFeatureCollection }>();
    let hoveredFeature: { source: string; id: string | number } | null = null;
    let selectedFeature: { source: string; id: string | number } | null = null;

    const refreshMetricBubbles = () => {
      if (!map.isStyleLoaded()) return;
      const source = map.getSource("metric-bubbles") as GeoJSONSource | undefined;
      if (!source) return;

      const level = activeAreaLevel(map.getZoom());
      const collection = areaDataRef.current[level] ?? emptyFeatureCollection();
      const valuesByKey = new Map<string, MetricBubbleValue>();
      for (const value of metricBubbleValuesRef.current) {
        valuesByKey.set(
          normalizedMetricKey(value.level, value.district, value.sector, value.cell, value.village),
          value
        );
      }

      // A parcel's map price is a size × transaction price per m² estimate.
      // Prefer a matching cell snapshot; use the existing district fallback only
      // when the cell has no unique usable value, just as the parcel detail does.
      const priceByCell = new Map<string, number>();
      for (const feature of (areaDataRef.current.cell ?? emptyFeatureCollection()).features) {
        const properties = feature.properties ?? {};
        const unitPrice = properties.average_land_price_per_m2;
        if (
          typeof unitPrice === "number" &&
          Number.isFinite(unitPrice) &&
          unitPrice > 0
        ) {
          priceByCell.set(
            normalizedMetricKey(properties.district, properties.sector, properties.cell),
            unitPrice
          );
        }
      }
      const priceBySector = new Map<string, number>();
      for (const feature of (areaDataRef.current.sector ?? emptyFeatureCollection()).features) {
        const properties = feature.properties ?? {};
        const unitPrice = properties.average_land_price_per_m2;
        if (
          typeof unitPrice === "number" &&
          Number.isFinite(unitPrice) &&
          unitPrice > 0 &&
          properties.district &&
          properties.sector
        ) {
          priceBySector.set(
            normalizedMetricKey(properties.district, properties.sector),
            unitPrice
          );
        }
      }
      const priceByDistrict = new Map<string, number>();
      for (const feature of (areaDataRef.current.district ?? emptyFeatureCollection()).features) {
        const properties = feature.properties ?? {};
        const unitPrice = properties.average_land_price_per_m2;
        if (
          typeof unitPrice === "number" &&
          Number.isFinite(unitPrice) &&
          unitPrice > 0 &&
          properties.district
        ) {
          priceByDistrict.set(normalizeMetricKeyPart(properties.district), unitPrice);
        }
      }

      const metric = selectedMetricRef.current;
      const features = collection.features.flatMap((feature, index) => {
        if (!feature.geometry || !("coordinates" in feature.geometry)) return [];
        const bounds = featureBounds({
          type: "Feature",
          geometry: feature.geometry,
          properties: feature.properties ?? {}
        } as MapGeoJSONFeature);
        if (!bounds) return [];

        const properties = feature.properties ?? {};
        const district = properties.district ?? null;
        const sector = properties.sector ?? null;
        const cell = properties.cell ?? null;
        const village = properties.village ?? null;
        let label = "";
        let hasValue = false;
        let status = "unavailable";
        let detail = "This metric is not connected to a verified source yet; no number is inferred.";
        let sortValue = 0;

        if (level === "parcel") {
          if (metric === "averageLandPricePerM2") {
            const directParcelPriceIsSourced =
              isParcelPriceType(properties.parcel_price_type) &&
              typeof properties.parcel_price_value === "number" &&
              Number.isFinite(properties.parcel_price_value) &&
              properties.parcel_price_value > 0 &&
              typeof properties.parcel_price_source === "string" &&
              properties.parcel_price_source.trim().length > 0;

            if (directParcelPriceIsSourced) {
              sortValue = properties.parcel_price_value as number;
              label = formatCompactValue(sortValue);
              hasValue = true;
              status = properties.parcel_price_type as ParcelPriceType;
              detail =
                parcelPriceTypeLabel(properties.parcel_price_type as ParcelPriceType) +
                ": " + formatCompactValue(sortValue) +
                ". Source: " + properties.parcel_price_source +
                (properties.parcel_price_date ? ". Date: " + properties.parcel_price_date : "") +
                (properties.parcel_price_note ? ". " + properties.parcel_price_note : "") +
                ". The amount is displayed according to its stated source type; verify the source record before relying on it.";
            } else {
            const cadastralArea =
              typeof properties.parcel_size_m2 === "number" && properties.parcel_size_m2 > 0
                ? properties.parcel_size_m2
                : null;
            const geometryArea = geometryAreaM2(feature.geometry as Geometry);
            const parcelArea = cadastralArea ?? geometryArea;
            const directUnitPrice = properties.average_land_price_per_m2;
            const cellKey = normalizedMetricKey(district, sector, cell);
            const cellPrice = priceByCell.get(cellKey);
            const sectorPrice = district && sector
              ? priceBySector.get(normalizedMetricKey(district, sector))
              : undefined;
            const districtPrice = district ? priceByDistrict.get(normalizeMetricKeyPart(district)) : undefined;
            const unitPrice =
              typeof directUnitPrice === "number" && directUnitPrice > 0
                ? directUnitPrice
                : cellPrice ?? sectorPrice ?? districtPrice;
            const unitPriceSource =
              typeof directUnitPrice === "number" && directUnitPrice > 0
                ? "parcel-level"
                : cellPrice !== undefined
                  ? "matching cell-level transaction-price snapshot"
                  : sectorPrice !== undefined
                    ? "derived sector mean of available cell snapshots"
                    : districtPrice !== undefined
                      ? "district average transaction-price snapshot"
                      : "unavailable";

            if (
              typeof unitPrice === "number" &&
              Number.isFinite(unitPrice) &&
              unitPrice > 0
            ) {
              if (typeof parcelArea === "number" && Number.isFinite(parcelArea) && parcelArea > 0) {
                sortValue = calculateParcelAskingPrice(parcelArea, unitPrice) ?? 0;
                label = formatCompactValue(sortValue);
                hasValue = true;
                status = "calculated-asking-price";
                detail =
                  "Asking price: " +
                  formatCompactValue(parcelArea) +
                  " m² × " +
                  formatCompactValue(unitPrice) +
                  " RWF/m² average transaction-price snapshot = " +
                  formatCompactValue(sortValue) +
                  ". " +
                  (cadastralArea === null
                    ? "Parcel area is calculated approximately from the mapped parcel polygon. "
                    : "Parcel area comes from the cadastral size attribute. ") +
                  "Price basis: " +
                  unitPriceSource +
                  ". The current system defines asking price as parcel area × the available average transaction price per m².";
              } else {
                // Still show the existing price signal rather than blanking the
                // marker: this is the available area-level price per m², not a
                // total parcel price when no usable parcel area exists.
                sortValue = unitPrice;
                label = formatCompactValue(unitPrice);
                hasValue = true;
                status = "asking-price-unit-rate";
                detail =
                  "Average transaction price: " + formatCompactValue(unitPrice) +
                  " RWF/m² from the " + unitPriceSource +
                  ". The parcel total uses parcel area × this rate when the parcel area is available.";
              }
            } else {
              // The pilot districts have dashboard transaction-price snapshots.
              // If a GIS attribute is missing, do not substitute a made-up price;
              // leave this branch for genuinely missing future source coverage.
              detail = "No transaction-price snapshot is available for this parcel's district.";
            }
            }
          } else {
            detail =
              "A parcel-level value for the selected metric is not available; a broader-area number is not copied onto individual parcels.";
          }
        } else {
          const key = normalizedMetricKey(
            level,
            properties.district,
            level === "district" ? null : properties.sector,
            level === "cell" || level === "village" ? properties.cell : null,
            level === "village" ? properties.village : null
          );

          if (
            metric === "averageLandPricePerM2" &&
            typeof properties.average_land_price_per_m2 === "number" &&
            Number.isFinite(properties.average_land_price_per_m2)
          ) {
            sortValue = properties.average_land_price_per_m2;
            label = formatCompactValue(sortValue);
            hasValue = true;
            status = "provisional-transaction-price-snapshot";
            detail =
              properties.average_land_price_date_status ??
              "Provisional average transaction-price snapshot per square metre; source timing and method require confirmation.";
          } else if (metric === "transactionVolume") {
            const observed = valuesByKey.get(key);
            if (observed) {
              label = observed.label;
              sortValue = observed.estimate;
              hasValue = true;
              status = observed.status;
              detail = observed.method;
            } else {
              detail = "No metric summary was returned for this geography.";
            }
          } else if (metric === "capitalAppreciation") {
            detail = "A dated historical and current comparable transaction-price series is not connected. Appreciation is withheld rather than fabricated.";
          } else if (metric === "marketSupply") {
            detail = "Verified current listings available to transact are not connected. Registered parcel counts are not for-sale supply.";
          } else if (metric === "upcomingSupply") {
            detail = "A verified developer and future-supply pipeline is not connected.";
          } else if (metric === "rentalYield") {
            detail = "Comparable verified rent and purchase-price data are not connected.";
          }
        }

        const variant: MetricPillVariant = level === "parcel" ? "parcel" : "area";
        const sourceMarketStatus = level === "parcel" ? propertyMarketStatus(properties.market_status) : null;
        // Only source-backed listing status may control availability colors.
        // Cadastral parcels are not assumed to be for sale or off-market.
        const marketStatus = level === "parcel" ? sourceMarketStatus : null;
        const marketStatusSource = sourceMarketStatus ? "source" as const : null;
        const isSelected = level === "parcel" &&
          selectedFeature?.source === AREA_LAYERS.parcel.source &&
          String(selectedFeature.id) === String(feature.id);
        const hasVerifiedListingDate = level === "parcel" && isRecentlyListed(properties.listing_created_at);
        const isNewListing = hasVerifiedListingDate && sourceMarketStatus === "available";
        const pillDimensions = hasValue ? measureMetricPill(label, variant, isNewListing) : null;
        const iconImage = hasValue && pillDimensions
          ? ensureMetricPillImage(map, label, variant, pillDimensions, marketStatus, isSelected, isNewListing)
          : "";
        return [{
          type: "Feature" as const,
          id: "metric-bubble-" + level + "-" + String(feature.id ?? index),
          geometry: {
            type: "Point" as const,
            coordinates: [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2] as [number, number]
          },
          properties: {
            label,
            has_value: hasValue,
            icon_image: iconImage,
            pill_width: pillDimensions?.width ?? 0,
            pill_height: pillDimensions?.height ?? 0,
            show_dot: false,
            level,
            sort_priority: hasValue ? -Math.abs(sortValue) : 0,
            metric_label: metric,
            metric_status: status,
            metric_detail: detail,
            market_status: marketStatus,
            market_status_source: marketStatusSource,
            is_selected: isSelected,
            is_new_listing: isNewListing,
            area_feature_id: String(feature.id ?? index),
            upi: properties.upi ?? null,
            district,
            sector,
            cell,
            village
          }
        }];
      });

      // Measure collisions in viewport pixels instead of letting MapLibre hide
      // every overlapping symbol. One or two labels remain price capsules;
      // only connected collision groups of three or more become red dots.
      const pillScale = metricPillScaleAtZoom(map.getZoom());
      const collisionBoxes = features.flatMap((feature, featureIndex) => {
        if (
          !feature.properties.has_value ||
          !feature.properties.label ||
          !feature.properties.icon_image
        ) return [];
        const coordinates = feature.geometry.coordinates;
        const screenPoint = map.project(coordinates);
        return [{
          featureIndex,
          x: screenPoint.x,
          y: screenPoint.y - (
            feature.properties.level === "parcel"
              ? (feature.properties.pill_height ?? 20) * pillScale / 2
              : 0
          ),
          width: (feature.properties.pill_width ?? 34) * pillScale,
          height: (feature.properties.pill_height ?? 20) * pillScale
        }];
      });
      const crowdedLabelIndexes = findCrowdedMetricLabelIndexes(collisionBoxes);
      const renderedFeatures = features.map((feature, featureIndex) => ({
        ...feature,
        properties: {
          ...feature.properties,
          show_dot: crowdedLabelIndexes.has(featureIndex)
        }
      }));

      source.setData({ type: "FeatureCollection", features: renderedFeatures } as never);
    };
    refreshMetricBubblesRef.current = refreshMetricBubbles;

    const setFeatureFlag = (
      featureRef: { source: string; id: string | number } | null,
      key: "hover" | "selected",
      value: boolean
    ) => {
      if (!featureRef || !map.getSource(featureRef.source)) return;
      try {
        map.setFeatureState(featureRef, { [key]: value });
      } catch {
        // A style/source update can temporarily remove feature state.
      }
    };

    const selectFeatureState = (
      nextFeature: { source: string; id: string | number } | null
    ) => {
      setFeatureFlag(selectedFeature, "selected", false);
      selectedFeature = nextFeature;
      setFeatureFlag(selectedFeature, "selected", true);
      refreshMetricBubblesRef.current?.();
    };

    const syncSelectedArea = (area: SelectedArea | null) => {
      if (!area) {
        selectFeatureState(null);
        return;
      }
      const features = areaDataRef.current[area.level]?.features ?? [];
      const normalize = (value: unknown) => String(value ?? "")
        .trim()
        .replace(/\\s+/g, " ")
        .toLocaleLowerCase("en");
      const match = features.find((feature) => {
        const properties = feature.properties ?? {};
        if (area.level === "parcel") {
          return Boolean(area.upi) && normalize(properties.upi) === normalize(area.upi);
        }
        if (normalize(properties[area.level]) !== normalize(area.name)) return false;
        if (area.level !== "district" && normalize(properties.district) !== normalize(area.district)) return false;
        if ((area.level === "cell" || area.level === "village") &&
            normalize(properties.sector) !== normalize(area.sector)) return false;
        if (area.level === "village" && normalize(properties.cell) !== normalize(area.cell)) return false;
        return true;
      });
      const id = match?.id;
      if (match && (typeof id === "string" || typeof id === "number")) {
        selectFeatureState({ source: AREA_LAYERS[area.level].source, id });
      } else {
        selectFeatureState(null);
      }
    };
    selectionSyncRef.current = syncSelectedArea;


    const addAdministrativeLayers = () => {
      const empty = emptyFeatureCollection();

      // Each source contains only the features intersecting the current map view.
      for (const level of AREA_LEVELS) {
        const layer = AREA_LAYERS[level];
        if (!map.getSource(layer.source)) {
          map.addSource(layer.source, { type: "geojson", data: empty });
        }
      }

      if (!map.getSource("metric-bubbles")) {
        map.addSource("metric-bubbles", { type: "geojson", data: empty });
      }

      // Add every fill first, then outlines, then labels. This keeps the base
      // road map visible underneath and makes boundary lines crisp at every level.
      for (const level of AREA_LEVELS) {
        const layer = AREA_LAYERS[level];
        if (map.getLayer(layer.fill)) continue;

        map.addLayer({
          id: layer.fill,
          type: "fill",
          source: layer.source,
          layout: { visibility: level === "district" ? "visible" : "none" },
          paint: {
            "fill-color": areaFillColorExpression(
              showLandPriceHeatmapRef.current &&
                (level === "district" || level === "sector" || level === "cell"),
              layer.color,
              level === "parcel"
            ),
            // Keep parcels almost transparent until selected. A selected parcel
            // gets a cyan wash as well as a bright outline so the chosen plot is obvious.
            "fill-opacity": level === "parcel"
              ? [
                  "case",
                  ["boolean", ["feature-state", "selected"], false], 0.5,
                  ["boolean", ["feature-state", "hover"], false], 0.16,
                  0.008
                ]
              : AREA_FILL_OPACITY_EXPRESSION
          }
        });
      }

      for (const level of AREA_LEVELS) {
        const layer = AREA_LAYERS[level];
        if (map.getLayer(layer.outline)) continue;

        map.addLayer({
          id: layer.outline,
          type: "line",
          source: layer.source,
          layout: { visibility: level === "district" ? "visible" : "none" },
          paint: {
            "line-color": [
              "case",
              ["boolean", ["feature-state", "selected"], false],
              level === "parcel" ? "#00F0FF" : "#126347",
              ["boolean", ["feature-state", "hover"], false],
              "#06492E",
              level === "parcel"
                ? "#FFFFFF"
                : level === "village"
                  ? "#A68A56"
                  : "#668878"
            ],
            // Keep style expressions valid: feature-state logic must not wrap a
            // zoom-interpolation expression in a "case" expression. The map uses
            // crisp fixed-width strokes; selected/hovered boundaries get emphasis.
            "line-width": [
              "case",
              ["boolean", ["feature-state", "selected"], false],
              level === "parcel" ? 4.0 : 2.5,
              ["boolean", ["feature-state", "hover"], false],
              level === "parcel" ? 2.5 : 2.6,
              level === "parcel" ? 1.25 : level === "village" ? 1.35 : 1.05
            ],
            "line-opacity": level === "parcel" ? 0.98 : 0.94
          }
        });
      }

      // Optional contrast casing. Primary boundaries exist before this enhancement,
      // so a casing-style failure cannot prevent village or parcel lines from loading.
      if (!map.getLayer(PARCEL_OUTLINE_CASING_LAYER) && map.getLayer(AREA_LAYERS.parcel.outline)) {
        try {
          map.addLayer({
            id: PARCEL_OUTLINE_CASING_LAYER,
            type: "line",
            source: AREA_LAYERS.parcel.source,
            layout: { visibility: "none" },
            paint: {
              "line-color": "#1C2935",
              "line-width": [
                "interpolate", ["linear"], ["zoom"],
                VILLAGE_ZOOM, 1.8,
                PARCEL_ZOOM, 2.2,
                PARCEL_ZOOM + 3.85, 3.2
              ],
              "line-opacity": 0.96
            }
          }, AREA_LAYERS.parcel.outline);
        } catch (error) {
          console.warn("Optional parcel outline casing unavailable; primary parcel outlines remain active.", error);
        }
      }

      for (const level of AREA_LEVELS) {
        const layer = AREA_LAYERS[level];
        if (map.getLayer(layer.label)) continue;

        map.addLayer({
          id: layer.label,
          type: "symbol",
          source: layer.source,
          layout: {
            visibility: level === "district" ? "visible" : "none",
            "text-field": level === "parcel"
              ? ["to-string", ["get", layer.property]]
              : ["get", layer.property],
            "text-font": ["Noto Sans Medium", "Noto Sans Regular", "Arial Unicode MS Regular"],
            "text-size": [
              "interpolate",
              ["linear"],
              ["zoom"],
              layer.minZoom,
              level === "district" ? 10 : 8,
              layer.minZoom + 3,
              level === "district" ? 13 : 11
            ],
            "text-max-width": 12,
            "text-allow-overlap": false,
            "text-ignore-placement": false
          },
          paint: {
            "text-color": "#263D30",
            "text-halo-color": "#FFFFFF",
            "text-halo-width": 1.3,
            "text-halo-blur": 0.3
          }
        });
      }

      if (!map.getLayer("metric-bubbles-circle")) {
        map.addLayer({
          id: "metric-bubbles-circle",
          type: "circle",
          source: "metric-bubbles",
          minzoom: 5,
          filter: [
            "any",
            ["==", ["get", "show_dot"], true],
            ["all",
              ["==", ["get", "has_value"], false],
              ["!=", ["get", "metric_label"], "averageLandPricePerM2"]
            ]
          ],
          paint: {
            // Use a simple data-driven radius. Nesting multiple zoom
            // interpolations under "case" is rejected by MapLibre's style spec.
            "circle-radius": [
              "case",
              ["==", ["get", "show_dot"], true],
              2.35,
              3.2
            ],
            "circle-color": [
              "case",
              ["==", ["get", "is_selected"], true], "#2563EB",
              ["==", ["get", "market_status"], "available"], "#9D2932",
              ["==", ["get", "market_status"], "off-market"], "#343A40",
              ["==", ["get", "has_value"], false], "#8B9690",
              ["==", ["get", "level"], "parcel"], "#8B9690",
              "#9D2932"
            ],
            "circle-stroke-color": "#FFFFFF",
            "circle-stroke-width": 1,
            "circle-opacity": 0.98
          }
        });
      }
      if (!map.getLayer("metric-bubbles-label")) {
        map.addLayer({
          id: "metric-bubbles-label",
          type: "symbol",
          source: "metric-bubbles",
          minzoom: 5,
          filter: [
            "all",
            ["==", ["get", "has_value"], true],
            ["!=", ["get", "level"], "parcel"],
            ["!=", ["get", "show_dot"], true]
          ],
          layout: {
            "icon-image": ["get", "icon_image"],
            "icon-size": ["interpolate", ["linear"], ["zoom"], 5, 0.84, 12, 0.92, 16, 1, 19, 1.02],
            "icon-anchor": "center",
            "icon-padding": 2,
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
            "symbol-sort-key": ["get", "sort_priority"],
            "visibility": "visible"
          }
        });
      }

      if (!map.getLayer("metric-bubbles-parcel-label")) {
        map.addLayer({
          id: "metric-bubbles-parcel-label",
          type: "symbol",
          source: "metric-bubbles",
          minzoom: PARCEL_ZOOM,
          filter: [
            "all",
            ["==", ["get", "level"], "parcel"],
            ["==", ["get", "has_value"], true],
            ["!=", ["get", "show_dot"], true]
          ],
          layout: {
            "icon-image": ["get", "icon_image"],
            "icon-size": ["interpolate", ["linear"], ["zoom"], PARCEL_ZOOM, 1, 19, 1, 21, 1.02],
            "icon-anchor": "bottom",
            "icon-padding": 2,
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
            "symbol-sort-key": ["get", "sort_priority"],
            "visibility": "visible"
          }
        });
      }

    };

    const addShowOverlayLayers = () => {
      if (!map.getSource("show-overlays")) {
        map.addSource("show-overlays", { type: "geojson", data: emptyFeatureCollection() });
      }
      if (!map.getLayer("show-road-casing")) {
        map.addLayer({
          id: "show-road-casing",
          type: "line",
          source: "show-overlays",
          minzoom: 8.6,
          filter: ["all", ["in", ["geometry-type"], ["literal", ["LineString", "MultiLineString"]]], ["==", ["get", "overlay_category"], "transportation"]],
          paint: {
            "line-color": "#FFFFFF",
            "line-width": ["interpolate", ["linear"], ["zoom"], 8.6, 3.2, 12, 5, 16, 7],
            "line-opacity": 0.9
          }
        });
      }
      if (!map.getLayer("show-road-lines")) {
        map.addLayer({
          id: "show-road-lines",
          type: "line",
          source: "show-overlays",
          minzoom: 8.6,
          filter: ["all", ["in", ["geometry-type"], ["literal", ["LineString", "MultiLineString"]]], ["==", ["get", "overlay_category"], "transportation"]],
          paint: {
            "line-color": "#2675C7",
            "line-width": ["interpolate", ["linear"], ["zoom"], 8.6, 1.5, 12, 2.6, 16, 3.8],
            "line-opacity": 0.94
          }
        });
      }
      if (!map.getLayer("show-poi-fill")) {
        map.addLayer({
          id: "show-poi-fill",
          type: "fill",
          source: "show-overlays",
          filter: ["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]]],
          paint: {
            "fill-color": [
              "match", ["get", "overlay_category"],
              "landmarks", "#D6A344",
              "healthEducation", "#CB605B",
              "transportation", "#4A89D0",
              "nature", "#3C9B74",
              "#7A8B80"
            ],
            "fill-opacity": [
              "match", ["get", "overlay_category"],
              "nature", 0.25,
              "transportation", 0.2,
              "healthEducation", 0.18,
              0.16
            ]
          }
        });
      }
      if (!map.getLayer("show-poi-outline")) {
        map.addLayer({
          id: "show-poi-outline",
          type: "line",
          source: "show-overlays",
          filter: ["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]]],
          paint: {
            "line-color": [
              "match", ["get", "overlay_category"],
              "landmarks", "#B17B20",
              "healthEducation", "#AA3934",
              "transportation", "#1F5EA4",
              "nature", "#23764F",
              "#53645A"
            ],
            "line-width": ["interpolate", ["linear"], ["zoom"], 7, 1.1, 13, 1.8, 17, 2.4],
            "line-opacity": 0.95
          }
        });
      }
      if (!map.getLayer("show-poi-circles")) {
        map.addLayer({
          id: "show-poi-circles",
          type: "circle",
          source: "show-overlays",
          minzoom: 7,
          filter: ["==", ["geometry-type"], "Point"],
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 7, 3.6, 11, 5.2, 15, 7],
            "circle-color": [
              "match", ["get", "overlay_category"],
              "landmarks", "#D6A344",
              "healthEducation", "#CB605B",
              "transportation", "#4A89D0",
              "nature", "#3C9B74",
              "#7A8B80"
            ],
            "circle-stroke-color": "#FFFFFF",
            "circle-stroke-width": 1.8,
            "circle-opacity": 0.98
          }
        });
      }
      if (!map.getLayer("show-poi-labels")) {
        map.addLayer({
          id: "show-poi-labels",
          type: "symbol",
          source: "show-overlays",
          minzoom: 10.4,
          filter: ["all", ["==", ["geometry-type"], "Point"], ["has", "name"]],
          layout: {
            "text-field": ["get", "name"],
            "text-font": ["Noto Sans Medium", "Arial Unicode MS Regular"],
            "text-size": ["interpolate", ["linear"], ["zoom"], 10.4, 10, 15, 12],
            "text-offset": [0, 1.15],
            "text-anchor": "top",
            "text-max-width": 12,
            "text-allow-overlap": false
          },
          paint: {
            "text-color": "#19392B",
            "text-halo-color": "#FFFFFF",
            "text-halo-width": 1.8,
            "text-halo-blur": 0.35
          }
        });
      }
      applyShowOverlayFilters(map, showLayersRef.current);
    };

    const addZoningOverlayLayers = () => {
      if (!map.getSource("zoning-overlay")) {
        map.addSource("zoning-overlay", {
          type: "geojson",
          data: emptyFeatureCollection()
        });
      }
      if (!map.getLayer("zoning-overlay-fill")) {
        map.addLayer({
          id: "zoning-overlay-fill",
          type: "fill",
          source: "zoning-overlay",
          filter: ["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]]],
          paint: {
            "fill-color": [
              "match",
              ["get", "zoning"],
              "A1-Agriculture zone", "#9EBB84",
              "A2-Livestock zone", "#B1C78C",
              "R1-Low density residential zone", "#F4D7A0",
              "R1A-Low density residential densification zone", "#F0C58B",
              "R2-Medium density residential - Improvement zone", "#F5B66F",
              "R3-Medium density residential - Expansion zone", "#F28D5C",
              "R4-High density residential zone", "#E36A60",
              "C1-Mixed use zone", "#C87BAD",
              "C1-Mixed use commercial zone", "#C87BAD",
              "C3-City commercial zone", "#B7679E",
              "I1-Light industrial zone", "#A5A4B7",
              "I2-General industrial zone", "#858BA1",
              "P1-Parks and open spaces zone", "#79B88B",
              "P2-Sport and Eco tourism zone", "#69AD91",
              "P3B-Forest zone", "#479575",
              "PF1-Education and research facilities", "#7DABD5",
              "PF2-Health facilities", "#6D9EC9",
              "T-Transportation zone", "#8B96A7",
              "T1-Road reserve", "#8B96A7",
              "WB-Waterbody zone", "#64B6D6",
              "W1A-Wetland - Protected zone", "#91C9B7",
              "#B8C5BE"
            ],
            "fill-opacity": 0.34
          }
        });
      }
      if (!map.getLayer("zoning-overlay-outline")) {
        map.addLayer({
          id: "zoning-overlay-outline",
          type: "line",
          source: "zoning-overlay",
          filter: ["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]]],
          paint: {
            "line-color": "#627B6C",
            "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.35, 13, 0.8, 17, 1.2],
            "line-opacity": 0.68
          }
        });
      }
    };

    const keepParcelBoundariesAndMarkersAboveContext = () => {
      // Show/road and zoning overlays are added after administrative layers. Move
      // the cadastral strokes back above those overlays while keeping parcel labels
      // and price markers as the top-most interactive symbols.
      for (const layerId of [
        PARCEL_OUTLINE_CASING_LAYER,
        AREA_LAYERS.parcel.outline,
        AREA_LAYERS.parcel.label,
        "metric-bubbles-circle",
        "metric-bubbles-label",
        "metric-bubbles-parcel-label"
      ]) {
        if (map.getLayer(layerId)) map.moveLayer(layerId);
      }
    };

    const updateLayerVisibility = () => {
      const activeLevel = activeAreaLevel(map.getZoom());
      const activeIndex = AREA_LEVELS.indexOf(activeLevel);
      const villageIndex = AREA_LEVELS.indexOf("village");
      // Show cadastral outlines as soon as village boundaries appear. Parcel
      // outlines are an additional detail layer, not a replacement for villages.
      const showParcelBoundaries = activeIndex >= villageIndex;

      for (let index = 0; index < AREA_LEVELS.length; index += 1) {
        const level = AREA_LEVELS[index];
        const layer = AREA_LAYERS[level];
        const isActive = level === activeLevel;
        // Administrative fills/labels stay at one scale. At village and parcel
        // zoom, parcel outlines are drawn on top of the active administrative level.
        const showOutline = index === activeIndex || (level === "parcel" && showParcelBoundaries);

        if (map.getLayer(layer.fill)) {
          const showFill = isActive || (level === "parcel" && showParcelBoundaries);
          map.setLayoutProperty(layer.fill, "visibility", showFill ? "visible" : "none");
        }
        if (map.getLayer(layer.outline)) {
          map.setLayoutProperty(layer.outline, "visibility", showOutline ? "visible" : "none");
        }
        if (level === "parcel" && map.getLayer(PARCEL_OUTLINE_CASING_LAYER)) {
          map.setLayoutProperty(
            PARCEL_OUTLINE_CASING_LAYER,
            "visibility",
            showParcelBoundaries ? "visible" : "none"
          );
        }
        if (map.getLayer(layer.label)) {
          const showLabel =
            isActive && !(level === "parcel" && selectedMetricRef.current === "averageLandPricePerM2");
          map.setLayoutProperty(layer.label, "visibility", showLabel ? "visible" : "none");
        }
      }
    };

    const waitBeforeAreaRetry = (signal: AbortSignal, delayMs: number) =>
      new Promise<void>((resolve, reject) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          signal.removeEventListener("abort", abort);
          resolve();
        };
        const abort = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          signal.removeEventListener("abort", abort);
          reject(new Error("Area request was cancelled before its retry."));
        };
        const timer = setTimeout(finish, delayMs);
        if (signal.aborted) abort();
        else signal.addEventListener("abort", abort, { once: true });
      });

    const fetchAreas = async (
      level: AreaLevel,
      adminSource: AdminSourceId,
      viewBounds: ViewBounds,
      signal: AbortSignal
    ): Promise<MapFeatureCollection> => {
      const cacheKey = `${adminSource}:${level}`;
      const cached = areaCache.get(cacheKey);
      if (cached && boundsContain(cached.bounds, viewBounds)) return cached.data;

      const queryBounds = requestBoundsForArea(viewBounds, level);
      const bbox = queryBounds.join(",");
      const requestUrl = `/api/geography/areas?level=${level}&source=${adminSource}&bbox=${encodeURIComponent(bbox)}`;
      // Parcel requests get one bounded retry. A transient 502 or a successful
      // but empty response must not be cached as if it were complete coverage.
      const maxAttempts = level === "parcel" ? 2 : 1;
      let lastError: unknown = null;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        if (signal.aborted) throw new Error("Area request was cancelled.");
        recordE2ETrace("area-api-request", {
          level,
          adminSource,
          bbox,
          attempt,
          zoom: Number(map.getZoom().toFixed(2))
        });

        try {
          const response = await fetch(requestUrl, { signal });
          if (!response.ok) {
            recordE2ETrace("area-api-failure", {
              level,
              adminSource,
              status: response.status,
              attempt
            });
            const transient = [500, 502, 503, 504].includes(response.status);
            if (level === "parcel" && transient && attempt < maxAttempts) {
              recordE2ETrace("area-api-retry", {
                level,
                adminSource,
                reason: "http-" + response.status,
                nextAttempt: attempt + 1
              });
              await waitBeforeAreaRetry(signal, 650);
              continue;
            }

            if (cached && boundsIntersect(cached.bounds, queryBounds)) {
              recordE2ETrace("area-api-cache-fallback", {
                level,
                adminSource,
                status: response.status,
                cachedFeatureCount: cached.data.features?.length ?? 0
              });
              return cached.data;
            }
            throw new Error(`Administrative boundary request failed (${response.status})`);
          }

          const data = (await response.json()) as MapFeatureCollection;
          const featureCount = data.features?.length ?? 0;
          recordE2ETrace("area-api-response", {
            level,
            adminSource,
            status: response.status,
            featureCount,
            attempt
          });

          if (level === "parcel" && featureCount === 0 && attempt < maxAttempts) {
            recordE2ETrace("area-api-retry", {
              level,
              adminSource,
              reason: "empty-feature-collection",
              nextAttempt: attempt + 1
            });
            await waitBeforeAreaRetry(signal, 650);
            continue;
          }

          if (!signal.aborted && !(level === "parcel" && featureCount === 0)) {
            areaCache.set(cacheKey, { bounds: queryBounds, data });
          }
          return data;
        } catch (error) {
          lastError = error;
          if (signal.aborted) throw error;

          const httpFailure = error instanceof Error &&
            /Administrative boundary request failed \(\d+\)/.test(error.message);
          if (level === "parcel" && !httpFailure && attempt < maxAttempts) {
            recordE2ETrace("area-api-retry", {
              level,
              adminSource,
              reason: "network-error",
              nextAttempt: attempt + 1
            });
            await waitBeforeAreaRetry(signal, 650);
            continue;
          }
          throw error;
        }
      }

      throw lastError instanceof Error ? lastError : new Error("Parcel boundary request failed.");
    };

    const refreshAreas = async () => {
      const styleLoaded = map.isStyleLoaded();
      const districtSourceExists = Boolean(map.getSource("admin-districts"));
      recordE2ETrace("area-refresh-attempt", {
        styleLoaded,
        districtSourceExists,
        zoom: Number(map.getZoom().toFixed(2)),
        activeLevel: activeAreaLevel(map.getZoom())
      });
      // This function is called from style.load after we create the GeoJSON
      // sources. isStyleLoaded() can still be false while basemap tiles are
      // loading, but that must not block independent administrative/cadastral
      // API requests. Source existence is the relevant safety guard here.
      if (!districtSourceExists) {
        recordE2ETrace("area-refresh-skipped", { styleLoaded, districtSourceExists });
        return;
      }

      const activeLevel = activeAreaLevel(map.getZoom());
      const activeIndex = AREA_LEVELS.indexOf(activeLevel);
      const requestedLevels: AreaLevel[] = AREA_LEVELS.slice(0, activeIndex + 1);
      // At village zoom, request the parcel geometry as well as administrative
      // geometry. Previously this request stopped at "village", so the parcel
      // outline layer had no data at the zoom level where users need it most.
      if (activeLevel === "village") requestedLevels.push("parcel");
      const bounds = map.getBounds();
      const viewBounds: ViewBounds = [
        bounds.getWest(),
        bounds.getSouth(),
        bounds.getEast(),
        bounds.getNorth()
      ];
      const requestSources = (Object.keys(ADMIN_SOURCE_EXTENTS) as AdminSourceId[])
        .filter((adminSource) => boundsIntersect(viewBounds, ADMIN_SOURCE_EXTENTS[adminSource]));
      const refreshKey = [
        activeLevel,
        ...viewBounds.map((value) => value.toFixed(6)),
        ...requestSources
      ].join("|");
      if (lastParcelRetryKey !== refreshKey) {
        lastParcelRetryKey = refreshKey;
        parcelRetryCountForKey = 0;
      }

      // style.load, moveend/zoomend, and the one-time idle recovery can all
      // request the same viewport. Reuse the in-flight request set instead of
      // aborting its cadastral request and immediately starting a duplicate.
      if (activeController && !activeController.signal.aborted && activeRefreshKey === refreshKey) {
        recordE2ETrace("area-refresh-skipped-duplicate", {
          zoom: Number(map.getZoom().toFixed(2)),
          activeLevel,
          refreshKey
        });
        return;
      }

      const sequence = ++refreshSequence;
      activeController?.abort();
      const controller = new AbortController();
      activeController = controller;
      activeRefreshKey = refreshKey;
      recordE2ETrace("area-refresh-plan", {
        zoom: Number(map.getZoom().toFixed(2)),
        activeLevel,
        requestedLevels,
        viewBounds,
        requestSources
      });

      const dataByLevel = new Map<AreaLevel, Map<AdminSourceId, MapFeatureCollection>>();
      const pendingTasks: Promise<void>[] = [];
      let activeSourceSuccesses = 0;
      let activeSourceFailures = 0;
      let parcelSourceFailures = 0;
      const activeSourceCount = requestSources.length;
      let activeStatusReported = false;

      const publishLevel = (level: AreaLevel) => {
        if (sequence !== refreshSequence || controller.signal.aborted) return;
        const source = map.getSource(AREA_LAYERS[level].source) as GeoJSONSource | undefined;
        if (!source) return;
        const sourceData = dataByLevel.get(level);
        const merged = mergeAreaCollections(sourceData ? Array.from(sourceData.values()) : []);
        areaDataRef.current[level] = merged;
        source.setData(merged);
        selectionSyncRef.current?.(selectedAreaRef.current);
        refreshMetricBubbles();
        if (selectedFeature) setFeatureFlag(selectedFeature, "selected", true);
        if (hoveredFeature) setFeatureFlag(hoveredFeature, "hover", true);
      };

      const reportActiveReady = () => {
        if (activeStatusReported || activeSourceSuccesses === 0) return;
        activeStatusReported = true;
        onBoundaryStatusChange("ready");
      };

      for (const level of requestedLevels) {
        const levelData = new Map<AdminSourceId, MapFeatureCollection>();
        dataByLevel.set(level, levelData);

        for (const adminSource of requestSources) {
          const cacheKey = `${adminSource}:${level}`;
          const cached = areaCache.get(cacheKey);
          if (cached && boundsContain(cached.bounds, viewBounds)) {
            levelData.set(adminSource, cached.data);
            if (level === activeLevel) activeSourceSuccesses += 1;
            continue;
          }

          pendingTasks.push(
            fetchAreas(level, adminSource, viewBounds, controller.signal)
              .then((data) => {
                if (sequence !== refreshSequence || controller.signal.aborted) return;
                levelData.set(adminSource, data);
                publishLevel(level);
                if (level === activeLevel) {
                  activeSourceSuccesses += 1;
                  reportActiveReady();
                }
              })
              .catch((error: unknown) => {
                if (controller.signal.aborted || sequence !== refreshSequence) return;
                if (level === activeLevel) activeSourceFailures += 1;
                if (level === "parcel") parcelSourceFailures += 1;
                console.error(`Administrative ${level} boundaries failed for ${adminSource}.`, error);
              })
          );
        }
      }

      // Reuse warm boundary geometry immediately, then fill in only the
      // source/level combinations not already covered by the cached viewport.
      for (const level of requestedLevels) publishLevel(level);
      reportActiveReady();

      try {
        await Promise.all(pendingTasks);
        if (sequence !== refreshSequence || controller.signal.aborted) return;

        const results = requestedLevels.map((level) => ({
          level,
          data: mergeAreaCollections(Array.from(dataByLevel.get(level)?.values() ?? []))
        }));

        // Some Bugesera village records publish cell_id but not the cell name.
        // Parent cell polygons have already been fetched at this zoom, so join
        // those names by the official district + cell code rather than leaving
        // an incomplete village hierarchy in the selection panel.
        const cellNameByCode = new Map<string, string>();
        for (const result of results) {
          if (result.level !== "cell") continue;
          for (const feature of result.data.features) {
            const cellId = feature.properties?.cell_id;
            const cellName = feature.properties?.cell;
            if (!cellId || !cellName) continue;
            const key = `${feature.properties?.district_id ?? feature.properties?.district ?? ""}|${cellId}`;
            cellNameByCode.set(key, cellName);
          }
        }

        const villageResult = results.find((result) => result.level === "village");
        const parcelResult = results.find((result) => result.level === "parcel");

        // Join Bugesera village IDs from the official village polygons. Village
        // names can repeat across cells, so use cell ID + normalized exact name;
        // ambiguous matches are left blank rather than guessing.
        const normalisePlaceName = (value: string) =>
          value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
        const villageIdByCellAndName = new Map<string, string>();
        const ambiguousVillageKeys = new Set<string>();
        if (villageResult) {
          for (const feature of villageResult.data.features) {
            const cellId = feature.properties?.cell_id;
            const village = feature.properties?.village;
            const villageId = feature.properties?.village_id;
            if (!cellId || !village || !villageId) continue;
            const key = `${cellId}|${normalisePlaceName(village)}`;
            const existing = villageIdByCellAndName.get(key);
            if (existing && existing !== villageId) {
              villageIdByCellAndName.delete(key);
              ambiguousVillageKeys.add(key);
            } else if (!ambiguousVillageKeys.has(key)) {
              villageIdByCellAndName.set(key, villageId);
            }
          }
        }

        if (parcelResult) {
          parcelResult.data = {
            ...parcelResult.data,
            features: parcelResult.data.features.map((feature) => {
              if (feature.properties?.village_id || !feature.properties?.cell_id || !feature.properties?.village) {
                return feature;
              }
              const key = `${feature.properties.cell_id}|${normalisePlaceName(feature.properties.village)}`;
              const villageId = ambiguousVillageKeys.has(key) ? null : villageIdByCellAndName.get(key) ?? null;
              return villageId
                ? { ...feature, properties: { ...feature.properties, village_id: villageId } }
                : feature;
            })
          };
        }

        if (villageResult && cellNameByCode.size > 0) {
          villageResult.data = {
            ...villageResult.data,
            features: villageResult.data.features.map((feature) => {
              if (feature.properties?.cell) return feature;
              const cellId = feature.properties?.cell_id;
              if (!cellId) return feature;
              const key = `${feature.properties?.district_id ?? feature.properties?.district ?? ""}|${cellId}`;
              const cellName = cellNameByCode.get(key);
              if (!cellName) return feature;
              return {
                ...feature,
                properties: {
                  ...feature.properties,
                  cell: cellName
                }
              };
            })
          };
        }

        for (const result of results) {
          const source = map.getSource(AREA_LAYERS[result.level].source) as GeoJSONSource;
          areaDataRef.current[result.level] = result.data;
          source.setData(result.data);
        }
        const requestedLevelSet = new Set(requestedLevels);
        for (const level of AREA_LEVELS.filter((candidate) => !requestedLevelSet.has(candidate))) {
          const source = map.getSource(AREA_LAYERS[level].source) as GeoJSONSource;
          const emptyData = emptyFeatureCollection();
          areaDataRef.current[level] = emptyData;
          source.setData(emptyData);
        }
        selectionSyncRef.current?.(selectedAreaRef.current);
        refreshMetricBubbles();

        updateLayerVisibility();
        if (selectedFeature) setFeatureFlag(selectedFeature, "selected", true);
        if (hoveredFeature) setFeatureFlag(hoveredFeature, "hover", true);

        if (parcelResult && parcelResult.data.features.length > 0) {
          if (lastParcelRetryKey === refreshKey) {
            lastParcelRetryKey = null;
            parcelRetryCountForKey = 0;
          }
        } else if (
          (activeLevel === "village" || activeLevel === "parcel") &&
          parcelSourceFailures > 0 &&
          parcelRetryCountForKey < 1 &&
          parcelRefreshRetryTimer === null
        ) {
          // The idle callback can run while the first request set is still in
          // flight. If that request later fails, schedule a fresh bounded
          // refresh after its controller has been released.
          parcelRetryCountForKey += 1;
          recordE2ETrace("parcel-refresh-retry-scheduled", {
            refreshKey,
            retry: parcelRetryCountForKey
          });
          const retryDeadline = Date.now() + 20_000;
          const retryFailedViewport = () => {
            parcelRefreshRetryTimer = null;
            if (activeController && activeRefreshKey === refreshKey && Date.now() < retryDeadline) {
              parcelRefreshRetryTimer = setTimeout(retryFailedViewport, 500);
              return;
            }
            if (activeController && activeRefreshKey !== refreshKey) return;
            if (map.getZoom() >= VILLAGE_ZOOM) void refreshAreas();
          };
          parcelRefreshRetryTimer = setTimeout(retryFailedViewport, 900);
        }

        if (activeSourceCount === 0 || activeSourceSuccesses > 0) {
          onBoundaryStatusChange("ready");
        } else if (activeSourceFailures >= activeSourceCount) {
          onBoundaryStatusChange("error");
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("Administrative boundary loading failed.", error);
        onBoundaryStatusChange("error");
      } finally {
        if (activeController === controller) {
          activeController = null;
          activeRefreshKey = null;
        }
      }
    };

    let showOverlayController: AbortController | null = null;
    let showOverlaySequence = 0;
    let showOverlayTimer: ReturnType<typeof setTimeout> | null = null;

    const refreshShowOverlays = async () => {
      const source = map.getSource("show-overlays") as GeoJSONSource | undefined;
      if (!map.isStyleLoaded() || !source) return;
      showOverlayController?.abort();
      showOverlayController = null;
      const sequence = ++showOverlaySequence;
      const categories = showLayersRef.current;
      if (categories.length === 0) {
        source.setData(emptyFeatureCollection());
        return;
      }

      const controller = new AbortController();
      showOverlayController = controller;
      const bounds = map.getBounds();
      const bbox = [
        bounds.getWest(),
        bounds.getSouth(),
        bounds.getEast(),
        bounds.getNorth()
      ].map((value) => value.toFixed(6)).join(",");
      const params = new URLSearchParams({
        categories: categories.join(","),
        bbox,
        scope: showScopeRef.current
      });

      try {
        const response = await fetch("/api/geography/places?" + params.toString(), {
          signal: controller.signal
        });
        if (!response.ok) throw new Error("Place overlay request failed (" + response.status + ")");
        const data = await response.json() as MapFeatureCollection;
        if (sequence !== showOverlaySequence || controller.signal.aborted) return;
        source.setData(data);
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("Map place overlay loading failed.", error);
        source.setData(emptyFeatureCollection());
      }
    };

    const scheduleShowOverlayRefresh = () => {
      applyShowOverlayFilters(map, showLayersRef.current);
      if (showOverlayTimer) clearTimeout(showOverlayTimer);
      showOverlayTimer = setTimeout(() => void refreshShowOverlays(), 260);
    };
    refreshShowOverlaysRef.current = scheduleShowOverlayRefresh;

    let zoningOverlayController: AbortController | null = null;
    let zoningOverlaySequence = 0;
    let zoningOverlayTimer: ReturnType<typeof setTimeout> | null = null;

    const refreshZoningOverlay = async () => {
      const source = map.getSource("zoning-overlay") as GeoJSONSource | undefined;
      if (!map.isStyleLoaded() || !source) return;
      zoningOverlayController?.abort();
      zoningOverlayController = null;
      const sequence = ++zoningOverlaySequence;
      if (!showZoningRef.current) {
        source.setData(emptyFeatureCollection());
        return;
      }

      const controller = new AbortController();
      zoningOverlayController = controller;
      const bounds = map.getBounds();
      const bbox = [
        bounds.getWest(),
        bounds.getSouth(),
        bounds.getEast(),
        bounds.getNorth()
      ].map((value) => value.toFixed(6)).join(",");

      try {
        const response = await fetch("/api/geography/zoning?bbox=" + encodeURIComponent(bbox), {
          signal: controller.signal
        });
        if (!response.ok) throw new Error("Zoning request failed (" + response.status + ")");
        const data = await response.json() as MapFeatureCollection;
        if (sequence !== zoningOverlaySequence || controller.signal.aborted) return;
        source.setData(data);
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("Official zoning overlay failed.", error);
        source.setData(emptyFeatureCollection());
      }
    };

    const scheduleZoningRefresh = () => {
      if (zoningOverlayTimer) clearTimeout(zoningOverlayTimer);
      if (!showZoningRef.current) {
        zoningOverlayController?.abort();
        const source = map.getSource("zoning-overlay") as GeoJSONSource | undefined;
        source?.setData(emptyFeatureCollection());
        return;
      }
      zoningOverlayTimer = setTimeout(() => void refreshZoningOverlay(), 220);
    };
    refreshZoningRef.current = scheduleZoningRefresh;

    const scheduleRefresh = () => {
      if (parcelRefreshRetryTimer !== null) {
        clearTimeout(parcelRefreshRetryTimer);
        parcelRefreshRetryTimer = null;
      }
      updateLayerVisibility();
      scheduleShowOverlayRefresh();
      scheduleZoningRefresh();
      refreshMetricBubbles();
      if (refreshTimer !== null) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        // Clear the handle before refreshing so an idle fallback cannot mistake
        // an already-fired timer for a refresh that is still queued.
        refreshTimer = null;
        void refreshAreas();
      }, 220);
    };

    const setHover = (
      source: string,
      feature: MapGeoJSONFeature | undefined
    ) => {
      const id = feature ? getFeatureId(feature) : null;

      if (
        hoveredFeature &&
        (hoveredFeature.source !== source || hoveredFeature.id !== id)
      ) {
        setFeatureFlag(hoveredFeature, "hover", false);
        hoveredFeature = null;
      }

      if (id !== null) {
        hoveredFeature = { source, id };
        setFeatureFlag(hoveredFeature, "hover", true);
      }
    };

    const handleAreaMove = (
      level: AreaLevel,
      event: { features?: MapGeoJSONFeature[] }
    ) => {
      const layer = AREA_LAYERS[level];
      setHover(layer.source, event.features?.[0]);
      map.getCanvas().style.cursor = event.features?.length ? "pointer" : "";
    };

    const handleLeave = () => {
      setFeatureFlag(hoveredFeature, "hover", false);
      hoveredFeature = null;
      map.getCanvas().style.cursor = "";
    };

    const handleAreaClick = (
      level: AreaLevel,
      source: string,
      feature: MapGeoJSONFeature | undefined
    ) => {
      if (!feature) return;
      const id = getFeatureId(feature);
      const area = featureToArea(feature, level);
      if (id === null || !area) return;

      if (
        level === "parcel" &&
        selectedFeature?.source === source &&
        String(selectedFeature.id) === String(id)
      ) {
        selectFeatureState(null);
        onAreaSelected(null);
        return;
      }

      const properties = feature.properties as AreaProperties | null;
      const suppliedMarketStatus = propertyMarketStatus(properties?.market_status);
      const parcelMarketStatus = level === "parcel" ? suppliedMarketStatus : null;
      const parcelMarketStatusSource = suppliedMarketStatus ? "source" as const : null;

      selectFeatureState({ source, id });
      onAreaSelected({
        ...area,
        parcelMarketStatus,
        parcelMarketStatusSource
      });
      fitFeature(map, feature, level);
    };

    const attachInteractionHandlers = () => {
      if (layerInteractionsAttached) return;
      layerInteractionsAttached = true;

      for (const level of AREA_LEVELS) {
        const layer = AREA_LAYERS[level];
        map.on("mousemove", layer.fill, (event) => handleAreaMove(level, event));
        map.on("mouseleave", layer.fill, handleLeave);
        map.on("click", layer.fill, (event) =>
          handleAreaClick(level, layer.source, event.features?.[0])
        );
      }

      // Clicking a price capsule or collision dot selects that parcel too.
      // The marker carries the original cadastral feature ID so map styling and
      // the information panel stay in sync with polygon selection.
      const selectParcelFromMarker = (event: { features?: MapGeoJSONFeature[]; point: { x: number; y: number } }) => {
        const marker = event.features?.[0];
        const markerProperties = marker?.properties as AreaProperties | null;
        if (!markerProperties || markerProperties.level !== "parcel") return;
        const targetId = String(markerProperties.area_feature_id ?? "");
        if (!targetId) return;

        const renderedParcel = map.queryRenderedFeatures([event.point.x, event.point.y], {
          layers: [AREA_LAYERS.parcel.fill]
        }).find((candidate) => String(getFeatureId(candidate)) === targetId);
        const cachedParcel = areaDataRef.current.parcel?.features.find(
          (candidate) => String(candidate.id) === targetId
        ) as unknown as MapGeoJSONFeature | undefined;
        const parcelFeature = renderedParcel ?? cachedParcel;
        if (parcelFeature) handleAreaClick("parcel", AREA_LAYERS.parcel.source, parcelFeature);
      };

      map.on("click", "metric-bubbles-parcel-label", selectParcelFromMarker);
      map.on("click", "metric-bubbles-circle", selectParcelFromMarker);

      // Clicking an unoccupied part of the map clears selection and restores
      // the selected parcel capsule to its underlying market-status color.
      map.on("click", (event) => {
        const clickableLayers = [
          ...AREA_LEVELS.map((level) => AREA_LAYERS[level].fill),
          "metric-bubbles-circle",
          "metric-bubbles-label",
          "metric-bubbles-parcel-label",
        ].filter((layerId) => Boolean(map.getLayer(layerId)));

        const hits = clickableLayers.length
          ? map.queryRenderedFeatures(event.point, { layers: clickableLayers })
          : [];
        if (hits.length > 0) return;

        selectFeatureState(null);
        onAreaSelected(null);
      });
    };

    map.on("style.load", () => {
      styleLoaded = true;
      if (fallbackTimer) clearTimeout(fallbackTimer);
      if (basemapReadyTimer !== null) clearTimeout(basemapReadyTimer);
      basemapTileErrorRef.current = false;
      const styleMode = activeBasemapModeRef.current;
      const styleSequence = basemapStyleSequenceRef.current;
      onStatusChange("loading");
      addAdministrativeLayers();
      addShowOverlayLayers();
      addZoningOverlayLayers();
      keepParcelBoundariesAndMarkersAboveContext();
      updateLayerVisibility();
      applyShowOverlayFilters(map, showLayersRef.current);
      void refreshShowOverlays();
      void refreshZoningOverlay();
      const reportBasemapReadiness = () => {
        if (
          styleSequence !== basemapStyleSequenceRef.current ||
          styleMode !== activeBasemapModeRef.current
        ) return;
        if (basemapReadyTimer !== null) {
          clearTimeout(basemapReadyTimer);
          basemapReadyTimer = null;
        }
        const sourceLoaded = styleMode === "map"
          ? map.areTilesLoaded()
          : Boolean(map.getSource("world-imagery") && map.isSourceLoaded("world-imagery"));
        const ready = sourceLoaded && !basemapTileErrorRef.current;
        recordE2ETrace("basemap-readiness", {
          mode: styleMode,
          sourceLoaded,
          tileError: basemapTileErrorRef.current,
          ready
        });
        onStatusChange(ready ? "ready" : "error");
      };
      map.once("idle", reportBasemapReadiness);
      basemapReadyTimer = setTimeout(reportBasemapReadiness, 15_000);
      void refreshAreas();
      attachInteractionHandlers();

      // Style load can precede the first genuinely idle frame. Re-check the
      // active data source at idle so a transient early return cannot leave the
      // entire map showing administrative fills with empty outlines.
      map.once("idle", () => {
        const level = activeAreaLevel(map.getZoom());
        const activeFeatures = areaDataRef.current[level]?.features.length ?? 0;
        const parcelFeatures = areaDataRef.current.parcel?.features.length ?? 0;
        const needsRefresh = activeFeatures === 0 || (level === "village" && parcelFeatures === 0);
        recordE2ETrace("map-idle-area-check", {
          zoom: Number(map.getZoom().toFixed(2)),
          activeLevel: level,
          activeFeatures,
          parcelFeatures,
          needsRefresh
        });
        if (needsRefresh) {
          // The idle fallback can race with a delayed moveend/zoomend refresh.
          // Cancel that queued timer before starting the immediate refresh;
          // otherwise the timer fires moments later and aborts this request set.
          if (refreshTimer !== null) {
            clearTimeout(refreshTimer);
            refreshTimer = null;
          }
          void refreshAreas();
        }
      });

      if (!viewportListenersAttached) {
        map.on("moveend", scheduleRefresh);
        map.on("zoomend", scheduleRefresh);
        viewportListenersAttached = true;
      }
    });

    map.on("error", (event) => {
      if (!event.error) return;
      const mapError = event as typeof event & { sourceId?: string };
      const sourceId = mapError.sourceId ?? null;
      const mode = activeBasemapModeRef.current;
      recordE2ETrace("basemap-or-style-error", {
        mode,
        sourceId,
        message: event.error.message
      });

      // Raster source errors happen after style.load. The previous handler
      // returned as soon as the style loaded, hiding failed satellite tiles
      // while the status indicator continued to say "Basemap connected".
      if (sourceId === "world-imagery") {
        basemapTileErrorRef.current = true;
        onStatusChange("error");
        return;
      }
      if (sourceId === "world-transportation" && mode === "hybrid") {
        basemapTileErrorRef.current = true;
        onStatusChange("error");
        return;
      }
      if (styleLoaded) {
        basemapTileErrorRef.current = true;
        onStatusChange("error");
        return;
      }

      if (!fallbackAttempted) {
        fallbackAttempted = true;
        onStatusChange("loading");
        map.setStyle(FALLBACK_STYLE_URL);

        // Do not declare final failure during the brief style-switch window.
        if (fallbackTimer) clearTimeout(fallbackTimer);
        fallbackTimer = setTimeout(() => {
          if (!styleLoaded) onStatusChange("error");
        }, 12_000);
        return;
      }

      if (initialStyleUrl === FALLBACK_STYLE_URL) {
        onStatusChange("error");
      } else if (fallbackAttempted && !styleLoaded) {
        // Wait for the fallback's style.load event before marking it failed.
        if (!fallbackTimer) {
          fallbackTimer = setTimeout(() => {
            if (!styleLoaded) onStatusChange("error");
          }, 12_000);
        }
      }
    });

    onMapReady(map);

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            map.resize();
            updateRwandaZoomFloor();
          })
        : null;
    resizeObserver?.observe(container);

    return () => {
      if (refreshTimer !== null) clearTimeout(refreshTimer);
      if (parcelRefreshRetryTimer !== null) clearTimeout(parcelRefreshRetryTimer);
      if (basemapReadyTimer !== null) clearTimeout(basemapReadyTimer);
      if (showOverlayTimer) clearTimeout(showOverlayTimer);
      showOverlayController?.abort();
      if (zoningOverlayTimer) clearTimeout(zoningOverlayTimer);
      zoningOverlayController?.abort();
      refreshShowOverlaysRef.current = null;
      refreshZoningRef.current = null;
      refreshMetricBubblesRef.current = null;
      areaDataRef.current = {};
      if (fallbackTimer) clearTimeout(fallbackTimer);
      activeController?.abort();
      resizeObserver?.disconnect();
      map.remove();
      mapRef.current = null;
      if (e2eEnabled && e2eMapWindow.__RLI_E2E_MAP__ === map) {
        delete e2eMapWindow.__RLI_E2E_MAP__;
      }
      activeBasemapModeRef.current = "map";
      onMapReady(null);
    };
  }, [
    onMapReady,
    onStatusChange,
    onBoundaryStatusChange,
    onAreaSelected
  ]);

  return (
    <div
      aria-label="Interactive map focused on Kigali City and Bugesera District"
      className="maplibre-mount"
      ref={containerRef}
      role="application"
    />
  );
}
