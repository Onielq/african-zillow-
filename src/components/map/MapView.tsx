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
export type ShowLayer = "none" | "landmarks" | "medical" | "schools" | "transport" | "nature";
export type OverlayScope = "combined" | "kigali" | "bugesera";
export type AreaLevel = "district" | "sector" | "cell" | "village" | "parcel";

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
  averageLandPriceStatus?: string | null;
  averageLandPriceDateStatus?: string | null;
  pricedCellCount?: number | null;
  bounds?: [number, number, number, number] | null;
  sourceLabel?: string | null;
  sourceType?: "administrative-boundary" | "cadastral-parcel";
  upi?: string | null;
  parcelNumber?: string | null;
  parcelSizeM2?: number | null;
  wetlandAreaM2?: number | null;
  lastUpdatedOn?: number | null;
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
  average_land_price_status?: string | null;
  priced_cell_count?: number | null;
  price_source_lines?: number[] | null;
  source_label?: string | null;
  source_type?: string | null;
  upi?: string | null;
  parcel_number?: string | null;
  parcel_size_m2?: number | null;
  wetland_area_m2?: number | null;
  last_updated_on?: number | null;
};

type MapFeatureCollection = FeatureCollection<Geometry, AreaProperties>;

type MapViewProps = {
  basemapMode: BasemapMode;
  showLandPriceHeatmap: boolean;
  showLayer: ShowLayer;
  overlayScope: OverlayScope;
  onMapReady: (map: MapLibreMapInstance | null) => void;
  onStatusChange: (status: BasemapStatus) => void;
  onBoundaryStatusChange: (status: BoundaryStatus) => void;
  onAreaSelected: (area: SelectedArea | null) => void;
};

const FALLBACK_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
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

function areaFillColorExpression(level: AreaLevel, showLandPriceHeatmap: boolean) {
  const supportsPriceRamp = showLandPriceHeatmap &&
    (level === "district" || level === "sector" || level === "cell");
  return [
    "case",
    ["boolean", ["feature-state", "hover"], false],
    "#81BDA0",
    ["boolean", ["feature-state", "selected"], false],
    "#A3D3B9",
    supportsPriceRamp
      ? [
          "case",
          ["has", "average_land_price_per_m2"],
          [
            "interpolate",
            ["linear"],
            ["get", "average_land_price_per_m2"],
            1000, "#52CDAA",
            2500, "#77D9AF",
            5000, "#BCE6A5",
            10000, "#F0E66B",
            25000, "#F7B05A",
            50000, "#EE765D",
            100000, "#D34A4A",
            220000, "#7E263D"
          ],
          "#D9DEDA"
        ]
      : AREA_LAYERS[level].color
  ];
}

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

  const positions: Array<[number, number]> = [];
  if ("coordinates" in feature.geometry) collectPositions(feature.geometry.coordinates, positions);
  const validPositions = positions.filter(([longitude, latitude]) =>
    Number.isFinite(longitude) && Number.isFinite(latitude)
  );
  const bounds: [number, number, number, number] | null = validPositions.length
    ? [
        Math.min(...validPositions.map((position) => position[0])),
        Math.min(...validPositions.map((position) => position[1])),
        Math.max(...validPositions.map((position) => position[0])),
        Math.max(...validPositions.map((position) => position[1]))
      ]
    : null;

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
    averageLandPriceStatus: properties.average_land_price_status ?? null,
    averageLandPriceDateStatus: properties.average_land_price_date_status ?? null,
    pricedCellCount: typeof properties.priced_cell_count === "number" ? properties.priced_cell_count : null,
    bounds,
    sourceLabel: properties.source_label ?? null,
    sourceType: properties.source_type === "cadastral-parcel"
      ? "cadastral-parcel"
      : "administrative-boundary",
    upi: properties.upi ?? null,
    parcelNumber: properties.parcel_number ?? null,
    parcelSizeM2: properties.parcel_size_m2 ?? null,
    wetlandAreaM2: properties.wetland_area_m2 ?? null,
    lastUpdatedOn: properties.last_updated_on ?? null
  };
}

export function MapView({
  basemapMode,
  showLandPriceHeatmap,
  showLayer,
  overlayScope,
  onMapReady,
  onStatusChange,
  onBoundaryStatusChange,
  onAreaSelected
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMapInstance | null>(null);
  const activeBasemapModeRef = useRef<BasemapMode>("map");
  const showLandPriceHeatmapRef = useRef(showLandPriceHeatmap);
  const showLayerRef = useRef<ShowLayer>(showLayer);
  const overlayScopeRef = useRef<OverlayScope>(overlayScope);
  const refreshShowOverlayRef = useRef<(() => void) | null>(null);

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

    for (const level of AREA_LEVELS) {
      const layer = AREA_LAYERS[level];
      if (!map.getLayer(layer.fill)) continue;
      map.setPaintProperty(layer.fill, "fill-color", areaFillColorExpression(level, showLandPriceHeatmap));
      map.setPaintProperty(layer.fill, "fill-opacity", [
        "case",
        ["boolean", ["feature-state", "hover"], false],
        0.52,
        ["boolean", ["feature-state", "selected"], false],
        0.4,
        0.23
      ]);
    }
  }, [showLandPriceHeatmap]);

  useEffect(() => {
    showLayerRef.current = showLayer;
    overlayScopeRef.current = overlayScope;
    refreshShowOverlayRef.current?.();
  }, [showLayer, overlayScope]);

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
            "fill-color": areaFillColorExpression(level, showLandPriceHeatmapRef.current),
            "fill-opacity": [
              "case",
              ["boolean", ["feature-state", "hover"], false],
              0.52,
              ["boolean", ["feature-state", "selected"], false],
              0.4,
              0.23
            ]
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

      if (!map.getSource("show-overlays")) {
        map.addSource("show-overlays", { type: "geojson", data: empty });
      }
      if (!map.getLayer("show-overlay-area-fill")) {
        map.addLayer({
          id: "show-overlay-area-fill",
          type: "fill",
          source: "show-overlays",
          filter: ["==", ["geometry-type"], "Polygon"],
          paint: {
            "fill-color": ["match", ["get", "category"], "nature", "#53B789", "#4EBDC5"],
            "fill-opacity": 0.24
          }
        });
      }
      if (!map.getLayer("show-overlay-road-lines")) {
        map.addLayer({
          id: "show-overlay-road-lines",
          type: "line",
          source: "show-overlays",
          filter: ["all", ["==", ["geometry-type"], "LineString"], ["==", ["get", "kind"], "road"]],
          paint: {
            "line-color": "#18A7C0",
            "line-width": ["interpolate", ["linear"], ["zoom"], 9, 1, 13, 2.1, 17, 3.2],
            "line-opacity": 0.92
          }
        });
      }
      if (!map.getLayer("show-overlay-points")) {
        map.addLayer({
          id: "show-overlay-points",
          type: "circle",
          source: "show-overlays",
          filter: ["==", ["geometry-type"], "Point"],
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 3, 13, 5, 17, 7],
            "circle-color": [
              "match", ["get", "category"],
              "landmarks", "#D29A2E", "medical", "#D95361",
              "schools", "#3E8CC8", "transport", "#18A7C0",
              "nature", "#23845A", "#64766C"
            ],
            "circle-stroke-color": "#FFFFFF",
            "circle-stroke-width": 1.4,
            "circle-opacity": 0.96
          }
        });
      }
      if (!map.getLayer("show-overlay-labels")) {
        map.addLayer({
          id: "show-overlay-labels",
          type: "symbol",
          source: "show-overlays",
          filter: ["all", ["==", ["geometry-type"], "Point"], ["has", "name"]],
          minzoom: 11,
          layout: {
            "text-field": ["get", "name"],
            "text-font": ["Noto Sans Medium", "Noto Sans Regular", "Arial Unicode MS Regular"],
            "text-size": 10,
            "text-offset": [0, 1.15],
            "text-anchor": "top",
            "text-max-width": 12,
            "text-allow-overlap": false
          },
          paint: {
            "text-color": "#203D31",
            "text-halo-color": "#FFFFFF",
            "text-halo-width": 1.3
          }
        });
      }
      if (!map.getLayer("show-overlay-road-labels")) {
        map.addLayer({
          id: "show-overlay-road-labels",
          type: "symbol",
          source: "show-overlays",
          filter: ["all", ["==", ["get", "kind"], "road"], ["has", "name"]],
          minzoom: 12.5,
          layout: {
            "symbol-placement": "line",
            "text-field": ["get", "name"],
            "text-size": 9,
            "symbol-spacing": 240,
            "text-font": ["Noto Sans Medium", "Arial Unicode MS Regular"]
          },
          paint: {
            "text-color": "#126B80",
            "text-halo-color": "#FFFFFF",
            "text-halo-width": 1.2
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
        // Hide parent outlines when child geography is active so adjacent sectors
        // and cells have their own legible boundaries instead of a stacked grid.
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
    const overlayScopeBounds: Record<OverlayScope, [number, number, number, number]> = {
      kigali: [29.58, -2.12, 30.32, -1.47],
      bugesera: [29.82, -2.62, 30.56, -1.92],
      combined: [29.58, -2.62, 30.56, -1.47]
    };

    const refreshShowOverlay = () => {
      const source = map.getSource("show-overlays") as GeoJSONSource | undefined;
      const category = showLayerRef.current;
      if (!source) return;
      if (category === "none" || !map.isStyleLoaded()) {
        source.setData(emptyFeatureCollection());
        return;
      }

      const scope = overlayScopeBounds[overlayScopeRef.current];
      const bounds = map.getBounds();
      const west = Math.max(bounds.getWest(), scope[0]);
      const south = Math.max(bounds.getSouth(), scope[1]);
      const east = Math.min(bounds.getEast(), scope[2]);
      const north = Math.min(bounds.getNorth(), scope[3]);
      if (west >= east || south >= north) {
        source.setData(emptyFeatureCollection());
        return;
      }

      showOverlayController?.abort();
      const controller = new AbortController();
      showOverlayController = controller;
      const sequence = ++showOverlaySequence;
      const params = new URLSearchParams({
        category,
        scope: overlayScopeRef.current,
        bbox: [west, south, east, north].map((value) => value.toFixed(6)).join(","),
        zoom: map.getZoom().toFixed(2)
      });

      void fetch(`/api/map-overlays?${params.toString()}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error(`Overlay request failed (${response.status})`);
          return response.json() as Promise<MapFeatureCollection>;
        })
        .then((data) => {
          if (sequence !== showOverlaySequence || controller.signal.aborted) return;
          (map.getSource("show-overlays") as GeoJSONSource | undefined)?.setData(data);
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          console.warn("Map overlay source unavailable.", error);
          if (sequence === showOverlaySequence) {
            (map.getSource("show-overlays") as GeoJSONSource | undefined)?.setData(emptyFeatureCollection());
          }
        });
    };
    refreshShowOverlayRef.current = refreshShowOverlay;

    const scheduleRefresh = () => {
      updateLayerVisibility();
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => void refreshAreas(), 220);
      refreshShowOverlay();
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
      updateLayerVisibility();
      onStatusChange("ready");
      void refreshAreas();
      refreshShowOverlay();
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
      if (fallbackTimer) clearTimeout(fallbackTimer);
      activeController?.abort();
      showOverlayController?.abort();
      if (refreshShowOverlayRef.current === refreshShowOverlay) {
        refreshShowOverlayRef.current = null;
      }
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
