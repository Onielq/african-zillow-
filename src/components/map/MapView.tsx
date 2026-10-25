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

// Next.js 16 defaults to Turbopack. Serve both MapLibre worker modules from
// the same versioned public directory so the worker can resolve its sibling.
const mapLibreVersion = getVersion();
setWorkerUrl(`/vendor/maplibre-gl/${mapLibreVersion}/maplibre-gl-worker.mjs?v=${mapLibreVersion}`);

export type BasemapStatus = "loading" | "ready" | "error";
export type BoundaryStatus = "loading" | "ready" | "error";
export type BasemapMode = "map" | "satellite";
export type AreaLevel = "district" | "sector" | "cell" | "village" | "parcel";
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
  upi?: string | null;
  parcelNumber?: string | null;
  parcelSizeM2?: number | null;
  wetlandAreaM2?: number | null;
  lastUpdatedOn?: number | null;
  bounds?: [number, number, number, number] | null;
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
  upi?: string | null;
  parcel_number?: string | null;
  parcel_size_m2?: number | null;
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
  metric_label?: string | null;
  metric_status?: string | null;
  metric_detail?: string | null;
};

type MapFeatureCollection = FeatureCollection<Geometry, AreaProperties>;
type AdminSourceId = "kigali" | "bugesera";
type ViewBounds = [number, number, number, number];

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

type MetricPillVariant = "area" | "parcel";

function metricPillImageName(label: string, variant: MetricPillVariant): string {
  let hash = 5381;
  for (let index = 0; index < label.length; index += 1) {
    hash = (Math.imul(hash, 33) ^ label.charCodeAt(index)) >>> 0;
  }
  return "metric-price-pill-" + variant + "-" + hash.toString(36);
}

function ensureMetricPillImage(
  map: MapLibreMapInstance,
  label: string,
  variant: MetricPillVariant
): string {
  const imageName = metricPillImageName(label, variant);
  if (map.hasImage(imageName)) return imageName;

  const pixelRatio = 2;
  const font = variant === "parcel"
    ? "600 10px Arial, sans-serif"
    : "600 11px Arial, sans-serif";
  const measureCanvas = document.createElement("canvas");
  const measureContext = measureCanvas.getContext("2d");
  if (!measureContext) return "";

  measureContext.font = font;
  const textWidth = Math.ceil(measureContext.measureText(label).width);
  const height = variant === "parcel" ? 20 : 22;
  const width = Math.max(34, textWidth + 16);
  const canvas = document.createElement("canvas");
  canvas.width = width * pixelRatio;
  canvas.height = height * pixelRatio;
  const context = canvas.getContext("2d");
  if (!context) return "";

  context.scale(pixelRatio, pixelRatio);
  context.fillStyle = variant === "parcel" ? "#68747B" : "#9D2932";
  context.strokeStyle = "rgba(255, 255, 255, 0.94)";
  context.lineWidth = 1;

  const radius = height / 2;
  context.beginPath();
  context.moveTo(radius, 0.5);
  context.lineTo(width - radius, 0.5);
  context.quadraticCurveTo(width - 0.5, 0.5, width - 0.5, radius);
  context.lineTo(width - 0.5, height - radius);
  context.quadraticCurveTo(width - 0.5, height - 0.5, width - radius, height - 0.5);
  context.lineTo(radius, height - 0.5);
  context.quadraticCurveTo(0.5, height - 0.5, 0.5, height - radius);
  context.lineTo(0.5, radius);
  context.quadraticCurveTo(0.5, 0.5, radius, 0.5);
  context.closePath();
  context.fill();
  context.stroke();

  context.fillStyle = "#FFFFFF";
  context.font = font;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(label, width / 2, height / 2, width - 12);
  map.addImage(imageName, canvas, { pixelRatio });
  return imageName;
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

function areaFillColorExpression(showPrice: boolean, baseColor: string) {
  return [
    "case",
    ["boolean", ["feature-state", "hover"], false], "#65D5A1",
    ["boolean", ["feature-state", "selected"], false], "#FFE3A1",
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
  ["boolean", ["feature-state", "hover"], false], 0.74,
  ["boolean", ["feature-state", "selected"], false], 0.42,
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

// Esri World Imagery is provided as raster tiles. Keep its required attribution
// attached to the source so MapLibre's attribution control can display it.
const SATELLITE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    "world-imagery": {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
      ],
      tileSize: 256,
      minzoom: 0,
      maxzoom: 19,
      attribution:
        "Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community"
    }
  },
  layers: [
    {
      id: "world-imagery",
      type: "raster",
      source: "world-imagery",
      minzoom: 0,
      maxzoom: 19
    }
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
const PARCEL_ZOOM = 17.35;

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
      return 17.0;
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
    upi: properties.upi ?? null,
    parcelNumber: properties.parcel_number ?? null,
    parcelSizeM2: properties.parcel_size_m2 ?? null,
    wetlandAreaM2: properties.wetland_area_m2 ?? null,
    lastUpdatedOn: properties.last_updated_on ?? null,
    bounds: featureBounds(feature)
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
  showScope
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMapInstance | null>(null);
  const activeBasemapModeRef = useRef<BasemapMode>("map");
  const showLandPriceHeatmapRef = useRef(showLandPriceHeatmap);
  const selectedMetricRef = useRef<MapMetric>(selectedMetric);
  const metricBubbleValuesRef = useRef<MetricBubbleValue[]>([]);
  const areaDataRef = useRef<Partial<Record<AreaLevel, MapFeatureCollection>>>({});
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
    onStatusChange("loading");
    map.setStyle(basemapMode === "satellite" ? SATELLITE_STYLE : NORMAL_STYLE_URL);
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
    let activeController: AbortController | null = null;
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
            const parcelArea = properties.parcel_size_m2;
            const directUnitPrice = properties.average_land_price_per_m2;
            const cellKey = normalizedMetricKey(district, sector, cell);
            const cellPrice = priceByCell.get(cellKey);
            const districtPrice = district ? priceByDistrict.get(normalizeMetricKeyPart(district)) : undefined;
            const unitPrice =
              typeof directUnitPrice === "number" && directUnitPrice > 0
                ? directUnitPrice
                : cellPrice ?? districtPrice;
            const unitPriceSource =
              typeof directUnitPrice === "number" && directUnitPrice > 0
                ? "parcel-level"
                : cellPrice !== undefined
                  ? "matching cell-level"
                  : districtPrice !== undefined
                    ? "district-level fallback"
                    : "unavailable";

            if (
              typeof parcelArea === "number" &&
              Number.isFinite(parcelArea) &&
              parcelArea > 0 &&
              typeof unitPrice === "number" &&
              Number.isFinite(unitPrice) &&
              unitPrice > 0
            ) {
              sortValue = Math.round(parcelArea * unitPrice);
              label = formatCompactValue(sortValue);
              hasValue = true;
              status = "estimated-parcel-value";
              detail =
                "Indicative parcel value: " +
                formatCompactValue(parcelArea) +
                " m² × " +
                formatCompactValue(unitPrice) +
                " RWF/m² transaction-price snapshot. " +
                "Unit-price basis: " +
                unitPriceSource +
                ". It is an estimate, not a registered sale price or formal valuation.";
            } else {
              detail = "No parcel value is shown because usable parcel area or a defensible transaction-price estimate is unavailable.";
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
        const iconImage = hasValue ? ensureMetricPillImage(map, label, variant) : "";
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
            level,
            sort_priority: hasValue ? -Math.abs(sortValue) : 0,
            metric_label: metric,
            metric_status: status,
            metric_detail: detail,
            district,
            sector,
            cell,
            village
          }
        }];
      });

      source.setData({ type: "FeatureCollection", features } as never);
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
    };

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
              layer.color
            ),
            "fill-opacity": AREA_FILL_OPACITY_EXPRESSION
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
              ["boolean", ["feature-state", "hover"], false],
              "#06492E",
              ["boolean", ["feature-state", "selected"], false],
              "#126347",
              level === "parcel"
                ? "#A56A0A"
                : level === "village"
                  ? "#A68A56"
                  : "#668878"
            ],
            "line-width": [
              "case",
              ["boolean", ["feature-state", "hover"], false],
              level === "parcel" ? 3.2 : 3.0,
              ["boolean", ["feature-state", "selected"], false],
              level === "parcel" ? 2.8 : 2.5,
              level === "parcel"
                ? [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    PARCEL_ZOOM,
                    0.9,
                    PARCEL_ZOOM + 1.5,
                    1.7,
                    PARCEL_ZOOM + 3.85,
                    2.7
                  ]
                : [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    layer.minZoom,
                    0.75,
                    layer.minZoom + 2,
                    1.35,
                    layer.minZoom + 4,
                    2
                  ]
            ],
            "line-opacity": 0.94
          }
        });
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
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 2.5, SECTOR_ZOOM, 3, CELL_ZOOM, 3.3, PARCEL_ZOOM, 3.6],
            "circle-color": [
              "case",
              ["==", ["get", "has_value"], false], "#8B9690",
              ["==", ["get", "level"], "parcel"], "#68747B",
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
          filter: ["==", ["get", "has_value"], true],
          layout: {
            "icon-image": ["get", "icon_image"],
            "icon-size": ["interpolate", ["linear"], ["zoom"], 5, 0.84, 12, 0.92, 16, 1, 19, 1.02],
            "icon-anchor": "center",
            "icon-padding": 2,
            "icon-allow-overlap": false,
            "icon-ignore-placement": false,
            "symbol-sort-key": ["get", "sort_priority"]
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

    const updateLayerVisibility = () => {
      const activeLevel = activeAreaLevel(map.getZoom());
      const activeIndex = AREA_LEVELS.indexOf(activeLevel);

      for (let index = 0; index < AREA_LEVELS.length; index += 1) {
        const level = AREA_LEVELS[index];
        const layer = AREA_LAYERS[level];
        const isActive = level === activeLevel;
        // Show a single administrative boundary scale at a time. Once the
        // next zoom level takes over, the parent boundary disappears so sector
        // and cell polygons no longer read as one visually joined district.
        const showOutline = index === activeIndex;

        if (map.getLayer(layer.fill)) {
          map.setLayoutProperty(layer.fill, "visibility", isActive ? "visible" : "none");
        }
        if (map.getLayer(layer.outline)) {
          map.setLayoutProperty(layer.outline, "visibility", showOutline ? "visible" : "none");
        }
        if (map.getLayer(layer.label)) {
          const showLabel =
            isActive && !(level === "parcel" && selectedMetricRef.current === "averageLandPricePerM2");
          map.setLayoutProperty(layer.label, "visibility", showLabel ? "visible" : "none");
        }
      }
    };

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
      const response = await fetch(
        `/api/geography/areas?level=${level}&source=${adminSource}&bbox=${encodeURIComponent(bbox)}`,
        { signal }
      );

      if (!response.ok) {
        throw new Error(`Administrative boundary request failed (${response.status})`);
      }

      const data = (await response.json()) as MapFeatureCollection;
      if (!signal.aborted) areaCache.set(cacheKey, { bounds: queryBounds, data });
      return data;
    };

    const refreshAreas = async () => {
      if (!map.isStyleLoaded() || !map.getSource("admin-districts")) return;

      const sequence = ++refreshSequence;
      activeController?.abort();
      const controller = new AbortController();
      activeController = controller;
      const activeLevel = activeAreaLevel(map.getZoom());
      const activeIndex = AREA_LEVELS.indexOf(activeLevel);
      const requestedLevels = AREA_LEVELS.slice(0, activeIndex + 1);
      const bounds = map.getBounds();
      const viewBounds: ViewBounds = [
        bounds.getWest(),
        bounds.getSouth(),
        bounds.getEast(),
        bounds.getNorth()
      ];
      const requestSources = (Object.keys(ADMIN_SOURCE_EXTENTS) as AdminSourceId[])
        .filter((adminSource) => boundsIntersect(viewBounds, ADMIN_SOURCE_EXTENTS[adminSource]));

      const dataByLevel = new Map<AreaLevel, Map<AdminSourceId, MapFeatureCollection>>();
      const pendingTasks: Promise<void>[] = [];
      let activeSourceSuccesses = 0;
      let activeSourceFailures = 0;
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
        for (const level of AREA_LEVELS.slice(activeIndex + 1)) {
          const source = map.getSource(AREA_LAYERS[level].source) as GeoJSONSource;
          const emptyData = emptyFeatureCollection();
          areaDataRef.current[level] = emptyData;
          source.setData(emptyData);
        }
        refreshMetricBubbles();

        updateLayerVisibility();
        if (selectedFeature) setFeatureFlag(selectedFeature, "selected", true);
        if (hoveredFeature) setFeatureFlag(hoveredFeature, "hover", true);

        if (activeSourceCount === 0 || activeSourceSuccesses > 0) {
          onBoundaryStatusChange("ready");
        } else if (activeSourceFailures >= activeSourceCount) {
          onBoundaryStatusChange("error");
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("Administrative boundary loading failed.", error);
        onBoundaryStatusChange("error");
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
      updateLayerVisibility();
      scheduleShowOverlayRefresh();
      scheduleZoningRefresh();
      refreshMetricBubbles();
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => void refreshAreas(), 220);
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

      selectFeatureState({ source, id });
      onAreaSelected(area);
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
    };

    map.on("style.load", () => {
      styleLoaded = true;
      if (fallbackTimer) clearTimeout(fallbackTimer);
      addAdministrativeLayers();
      addShowOverlayLayers();
      addZoningOverlayLayers();
      updateLayerVisibility();
      applyShowOverlayFilters(map, showLayersRef.current);
      void refreshShowOverlays();
      void refreshZoningOverlay();
      onStatusChange("ready");
      void refreshAreas();
      attachInteractionHandlers();

      if (!viewportListenersAttached) {
        map.on("moveend", scheduleRefresh);
        map.on("zoomend", scheduleRefresh);
        viewportListenersAttached = true;
      }
    });

    map.on("error", (event) => {
      if (styleLoaded || !event.error) return;

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
      if (refreshTimer) clearTimeout(refreshTimer);
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
