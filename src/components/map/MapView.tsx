"use client";

import { useEffect, useRef } from "react";
import {
  AttributionControl,
  Map as MapLibreMap,
  NavigationControl,
  ScaleControl,
  type GeoJSONSource,
  type Map as MapLibreMapInstance,
  type MapGeoJSONFeature
} from "maplibre-gl";
import type { FeatureCollection, Geometry } from "geojson";

export type BasemapStatus = "loading" | "ready" | "error";
export type BoundaryStatus = "loading" | "ready" | "error";
export type AreaLevel = "district" | "sector";

export type SelectedArea = {
  level: AreaLevel;
  name: string;
  district: string;
  districtId: string | null;
  sectorId: string | null;
};

type AreaProperties = {
  district?: string | null;
  district_id?: string | null;
  sector?: string | null;
  sector_id?: string | null;
};

type MapFeatureCollection = FeatureCollection<Geometry, AreaProperties>;

type MapViewProps = {
  onMapReady: (map: MapLibreMapInstance | null) => void;
  onStatusChange: (status: BasemapStatus) => void;
  onBoundaryStatusChange: (status: BoundaryStatus) => void;
  onAreaSelected: (area: SelectedArea | null) => void;
};

const DEFAULT_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
const SECTOR_ZOOM = 9.55;
const ADMIN_SOURCE_URL =
  "https://moegis.environment.gov.rw/server/rest/services/Hosted/Administrative_boundaries/FeatureServer";

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
    ? { top: 150, bottom: 150, left: 24, right: 24 }
    : { top: 112, bottom: 74, left: 326, right: 72 };

  map.fitBounds(
    [
      [west, south],
      [east, north]
    ],
    {
      padding,
      maxZoom: level === "district" ? 10.8 : 12.6,
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

  const districtId = properties.district_id ?? null;
  const sectorId = properties.sector_id ?? null;
  const sectorName = properties.sector ?? null;

  if (level === "sector" && !sectorName) return null;

  return {
    level,
    name: level === "sector" ? sectorName as string : properties.district,
    district: properties.district,
    districtId,
    sectorId
  };
}

export function MapView({
  onMapReady,
  onStatusChange,
  onBoundaryStatusChange,
  onAreaSelected
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    onStatusChange("loading");
    onBoundaryStatusChange("loading");

    const styleUrl =
      process.env.NEXT_PUBLIC_MAP_STYLE_URL?.trim() || DEFAULT_STYLE_URL;

    const map = new MapLibreMap({
      container,
      style: styleUrl,
      center: [30.13, -2.1],
      zoom: 8.35,
      minZoom: 5,
      maxZoom: 19,
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
      new AttributionControl({
        compact: false,
        customAttribution:
          "© OpenFreeMap · Administrative areas: Rwanda Environment Ministry GIS (2022 census basis; reuse terms to confirm)"
      }),
      "bottom-left"
    );

    let initialStyleLoaded = false;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let activeController: AbortController | null = null;
    let refreshSequence = 0;
    let boundaryDataLoaded = false;
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

      if (!map.getSource("admin-districts")) {
        map.addSource("admin-districts", {
          type: "geojson",
          data: empty,
          promoteId: undefined
        });
      }

      if (!map.getSource("admin-sectors")) {
        map.addSource("admin-sectors", {
          type: "geojson",
          data: empty
        });
      }

      if (!map.getLayer("district-fill")) {
        map.addLayer({
          id: "district-fill",
          type: "fill",
          source: "admin-districts",
          paint: {
            "fill-color": [
              "case",
              ["boolean", ["feature-state", "hover"], false],
              "#A7D4B8",
              ["boolean", ["feature-state", "selected"], false],
              "#B6DCC4",
              "#DCEAE1"
            ],
            "fill-opacity": [
              "case",
              ["boolean", ["feature-state", "hover"], false],
              0.72,
              ["boolean", ["feature-state", "selected"], false],
              0.66,
              0.34
            ]
          }
        });
      }

      if (!map.getLayer("district-outline")) {
        map.addLayer({
          id: "district-outline",
          type: "line",
          source: "admin-districts",
          paint: {
            "line-color": [
              "case",
              ["boolean", ["feature-state", "hover"], false],
              "#176B50",
              ["boolean", ["feature-state", "selected"], false],
              "#176B50",
              "#728F7E"
            ],
            "line-width": [
              "interpolate",
              ["linear"],
              ["zoom"],
              7,
              1,
              11,
              2.2,
              14,
              2.8
            ],
            "line-opacity": 0.9
          }
        });
      }

      if (!map.getLayer("district-label")) {
        map.addLayer({
          id: "district-label",
          type: "symbol",
          source: "admin-districts",
          layout: {
            "text-field": ["get", "district"],
            "text-font": ["Open Sans Semibold", "Arial Unicode MS Regular"],
            "text-size": ["interpolate", ["linear"], ["zoom"], 7.5, 11, 9.4, 13],
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

      if (!map.getLayer("sector-fill")) {
        map.addLayer({
          id: "sector-fill",
          type: "fill",
          source: "admin-sectors",
          layout: { visibility: "none" },
          paint: {
            "fill-color": [
              "case",
              ["boolean", ["feature-state", "hover"], false],
              "#9FCFB0",
              ["boolean", ["feature-state", "selected"], false],
              "#B5DFC2",
              "#E2EEE6"
            ],
            "fill-opacity": [
              "case",
              ["boolean", ["feature-state", "hover"], false],
              0.82,
              ["boolean", ["feature-state", "selected"], false],
              0.74,
              0.44
            ]
          }
        });
      }

      if (!map.getLayer("sector-outline")) {
        map.addLayer({
          id: "sector-outline",
          type: "line",
          source: "admin-sectors",
          layout: { visibility: "none" },
          paint: {
            "line-color": [
              "case",
              ["boolean", ["feature-state", "hover"], false],
              "#176B50",
              ["boolean", ["feature-state", "selected"], false],
              "#176B50",
              "#88A393"
            ],
            "line-width": [
              "case",
              ["boolean", ["feature-state", "hover"], false],
              2.5,
              ["boolean", ["feature-state", "selected"], false],
              2.4,
              ["interpolate", ["linear"], ["zoom"], 9.5, 0.8, 13, 1.5, 16, 2]
            ],
            "line-opacity": 0.95
          }
        });
      }

      if (!map.getLayer("sector-label")) {
        map.addLayer({
          id: "sector-label",
          type: "symbol",
          source: "admin-sectors",
          layout: {
            visibility: "none",
            "text-field": ["get", "sector"],
            "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
            "text-size": ["interpolate", ["linear"], ["zoom"], 9.5, 9, 12.5, 12],
            "text-max-width": 10,
            "text-allow-overlap": false,
            "text-ignore-placement": false
          },
          paint: {
            "text-color": "#2D4B39",
            "text-halo-color": "#FFFFFF",
            "text-halo-width": 1.2,
            "text-halo-blur": 0.3
          }
        });
      }
    };

    const updateLayerVisibility = () => {
      if (!map.getLayer("district-fill")) return;
      const showSectors = map.getZoom() >= SECTOR_ZOOM;

      map.setLayoutProperty("district-fill", "visibility", showSectors ? "none" : "visible");
      map.setLayoutProperty("district-label", "visibility", showSectors ? "none" : "visible");
      map.setLayoutProperty("sector-fill", "visibility", showSectors ? "visible" : "none");
      map.setLayoutProperty("sector-outline", "visibility", showSectors ? "visible" : "none");
      map.setLayoutProperty("sector-label", "visibility", showSectors ? "visible" : "none");
      map.setPaintProperty(
        "district-outline",
        "line-width",
        showSectors
          ? ["interpolate", ["linear"], ["zoom"], 9.5, 1.5, 13, 2.4, 16, 2.8]
          : ["interpolate", ["linear"], ["zoom"], 7, 1, 11, 2.2, 14, 2.8]
      );
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
      ].map((value) => value.toFixed(4)).join(",");

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

      try {
        const districts = await fetchAreas("district", controller.signal);
        if (sequence !== refreshSequence) return;

        (map.getSource("admin-districts") as GeoJSONSource).setData(districts);

        const showSectors = map.getZoom() >= SECTOR_ZOOM;
        if (showSectors) {
          const sectors = await fetchAreas("sector", controller.signal);
          if (sequence !== refreshSequence) return;
          (map.getSource("admin-sectors") as GeoJSONSource).setData(sectors);
        } else {
          (map.getSource("admin-sectors") as GeoJSONSource).setData(
            emptyFeatureCollection()
          );
        }

        updateLayerVisibility();
        if (selectedFeature) setFeatureFlag(selectedFeature, "selected", true);
        if (hoveredFeature) setFeatureFlag(hoveredFeature, "hover", true);

        boundaryDataLoaded = true;
        onBoundaryStatusChange("ready");
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("Administrative boundary loading failed.", error);
        onBoundaryStatusChange("error");
      }
    };

    const scheduleRefresh = () => {
      updateLayerVisibility();
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

    const handleDistrictMove = (event: { features?: MapGeoJSONFeature[] }) => {
      setHover("admin-districts", event.features?.[0]);
      map.getCanvas().style.cursor = event.features?.length ? "pointer" : "";
    };

    const handleSectorMove = (event: { features?: MapGeoJSONFeature[] }) => {
      setHover("admin-sectors", event.features?.[0]);
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

    map.on("load", () => {
      initialStyleLoaded = true;
      addAdministrativeLayers();
      updateLayerVisibility();
      onStatusChange("ready");
      void refreshAreas();

      map.on("moveend", scheduleRefresh);
      map.on("zoomend", scheduleRefresh);

      map.on("mousemove", "district-fill", handleDistrictMove);
      map.on("mouseleave", "district-fill", handleLeave);
      map.on("click", "district-fill", (event) =>
        handleAreaClick("district", "admin-districts", event.features?.[0])
      );

      map.on("mousemove", "sector-fill", handleSectorMove);
      map.on("mouseleave", "sector-fill", handleLeave);
      map.on("click", "sector-fill", (event) =>
        handleAreaClick("sector", "admin-sectors", event.features?.[0])
      );
    });

    map.on("error", (event) => {
      if (!initialStyleLoaded && event.error) onStatusChange("error");
    });

    onMapReady(map);

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => map.resize())
        : null;
    resizeObserver?.observe(container);

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      activeController?.abort();
      resizeObserver?.disconnect();
      map.remove();
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
