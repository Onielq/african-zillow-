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
import type { FeatureCollection, Geometry, Position } from "geojson";

// Next.js 16 defaults to Turbopack. Serve both MapLibre worker modules from
// the same versioned public directory so the worker can resolve its sibling.
const mapLibreVersion = getVersion();
setWorkerUrl(`/vendor/maplibre-gl/${mapLibreVersion}/maplibre-gl-worker.mjs?v=${mapLibreVersion}`);

export type BasemapStatus = "loading" | "ready" | "error";
export type BoundaryStatus = "loading" | "ready" | "error";
export type BasemapMode = "map" | "satellite";
export type AreaLevel = "district" | "sector" | "cell" | "village" | "parcel";
export type MapOverlayCategory = "landmarks" | "healthEducation" | "transportation" | "nature";
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
};

type MapFeatureCollection = FeatureCollection<Geometry, AreaProperties>;

type MapViewProps = {
  basemapMode: BasemapMode;
  showLandPriceHeatmap: boolean;
  showLayers: MapOverlayCategory[];
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
    ["boolean", ["feature-state", "hover"], false], "#B9EBD4",
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
  ["boolean", ["feature-state", "hover"], false], 0.58,
  ["boolean", ["feature-state", "selected"], false], 0.42,
  0.23
] as never;

function applyShowOverlayFilters(map: MapLibreMapInstance, categories: MapOverlayCategory[]) {
  const categoryFilter = categories.length
    ? ["in", ["get", "overlay_category"], ["literal", categories]]
    : ["==", ["get", "overlay_category"], "__hidden__"];
  const filters: Array<[string, unknown[]]> = [
    ["show-road-lines", ["all", ["==", ["geometry-type"], "LineString"], ["==", ["get", "overlay_category"], "transportation"], categoryFilter]],
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
const SECTOR_ZOOM = 9.55;
const CELL_ZOOM = 12.15;
const VILLAGE_ZOOM = 14.75;
const PARCEL_ZOOM = 16.15;

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
      return 10.8;
    case "sector":
      return 12.6;
    case "cell":
      return 15.0;
    case "village":
      return 17.2;
    case "parcel":
      return 19.0;
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
  const showLayersRef = useRef(showLayers);
  const showScopeRef = useRef(showScope);
  const refreshShowOverlaysRef = useRef<(() => void) | null>(null);

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
    let hoveredFeature: { source: string; id: string | number } | null = null;
    let selectedFeature: { source: string; id: string | number } | null = null;

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
              "#126347",
              ["boolean", ["feature-state", "selected"], false],
              "#126347",
              level === "parcel"
                ? "#A56A0A"
                : level === "village"
                  ? "#A68A56"
                  : "#668878"
            ],
            "line-width": level === "parcel"
              ? [
                  "case",
                  ["boolean", ["feature-state", "selected"], false],
                  [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    PARCEL_ZOOM,
                    1.7,
                    PARCEL_ZOOM + 2,
                    2.5,
                    PARCEL_ZOOM + 3.85,
                    3.2
                  ],
                  [
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
    };

    const addShowOverlayLayers = () => {
      if (!map.getSource("show-overlays")) {
        map.addSource("show-overlays", { type: "geojson", data: emptyFeatureCollection() });
      }
      if (!map.getLayer("show-road-lines")) {
        map.addLayer({
          id: "show-road-lines",
          type: "line",
          source: "show-overlays",
          minzoom: 8.6,
          filter: ["all", ["==", ["geometry-type"], "LineString"], ["==", ["get", "overlay_category"], "transportation"]],
          paint: {
            "line-color": "#2675C7",
            "line-width": ["interpolate", ["linear"], ["zoom"], 8.6, 1.2, 12, 2.2, 16, 3],
            "line-opacity": 0.8
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
            "fill-opacity": 0.22
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
            "line-width": 1.3,
            "line-opacity": 0.84
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
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 7, 3, 11, 4.6, 15, 6],
            "circle-color": [
              "match", ["get", "overlay_category"],
              "landmarks", "#D6A344",
              "healthEducation", "#CB605B",
              "transportation", "#4A89D0",
              "nature", "#3C9B74",
              "#7A8B80"
            ],
            "circle-stroke-color": "#FFFFFF",
            "circle-stroke-width": 1.4,
            "circle-opacity": 0.96
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
            "text-size": 10,
            "text-offset": [0, 1.05],
            "text-anchor": "top",
            "text-max-width": 12,
            "text-allow-overlap": false
          },
          paint: {
            "text-color": "#19392B",
            "text-halo-color": "#FFFFFF",
            "text-halo-width": 1.4
          }
        });
      }
      applyShowOverlayFilters(map, showLayersRef.current);
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
          map.setLayoutProperty(layer.label, "visibility", isActive ? "visible" : "none");
        }
      }
    };

    const fetchAreas = async (
      level: AreaLevel,
      signal: AbortSignal
    ): Promise<MapFeatureCollection> => {
      const bounds = map.getBounds();
      const bbox = [
        bounds.getWest(),
        bounds.getSouth(),
        bounds.getEast(),
        bounds.getNorth()
      ].map((value) => value.toFixed(6)).join(",");

      const response = await fetch(
        `/api/geography/areas?level=${level}&bbox=${encodeURIComponent(bbox)}`,
        { signal }
      );

      if (!response.ok) {
        throw new Error(`Administrative boundary request failed (${response.status})`);
      }

      return (await response.json()) as MapFeatureCollection;
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

      try {
        const results = await Promise.all(
          requestedLevels.map(async (level) => ({
            level,
            data: await fetchAreas(level, controller.signal)
          }))
        );
        if (sequence !== refreshSequence) return;

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
          source.setData(result.data);
        }
        for (const level of AREA_LEVELS.slice(activeIndex + 1)) {
          const source = map.getSource(AREA_LAYERS[level].source) as GeoJSONSource;
          source.setData(emptyFeatureCollection());
        }

        updateLayerVisibility();
        if (selectedFeature) setFeatureFlag(selectedFeature, "selected", true);
        if (hoveredFeature) setFeatureFlag(hoveredFeature, "hover", true);
        onBoundaryStatusChange("ready");
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
      const categories = showLayersRef.current;
      if (categories.length === 0) {
        source.setData(emptyFeatureCollection());
        return;
      }

      showOverlayController?.abort();
      const controller = new AbortController();
      showOverlayController = controller;
      const sequence = ++showOverlaySequence;
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

    const scheduleRefresh = () => {
      updateLayerVisibility();
      scheduleShowOverlayRefresh();
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
      updateLayerVisibility();
      applyShowOverlayFilters(map, showLayersRef.current);
      void refreshShowOverlays();
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
      refreshShowOverlaysRef.current = null;
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
