"use client";

import { useEffect, useRef } from "react";
import {
  AttributionControl,
  Map as MapLibreMap,
  NavigationControl,
  ScaleControl,
  type Map as MapLibreMapInstance
} from "maplibre-gl";

export type BasemapStatus = "loading" | "ready" | "error";

type MapViewProps = {
  onMapReady: (map: MapLibreMapInstance | null) => void;
  onStatusChange: (status: BasemapStatus) => void;
};

const DEFAULT_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

export function MapView({ onMapReady, onStatusChange }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    onStatusChange("loading");

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
      new NavigationControl({
        showCompass: true,
        visualizePitch: false
      }),
      "bottom-right"
    );

    map.addControl(
      new ScaleControl({
        unit: "metric",
        maxWidth: 120
      }),
      "bottom-left"
    );

    map.addControl(
      new AttributionControl({
        compact: false,
        customAttribution: "© OpenFreeMap"
      }),
      "bottom-left"
    );

    let initialStyleLoaded = false;

    map.once("load", () => {
      initialStyleLoaded = true;
      onStatusChange("ready");
    });

    map.on("error", (event) => {
      if (!initialStyleLoaded && event.error) {
        onStatusChange("error");
      }
    });

    onMapReady(map);

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => map.resize())
        : null;

    resizeObserver?.observe(container);

    return () => {
      resizeObserver?.disconnect();
      map.remove();
      onMapReady(null);
    };
  }, [onMapReady, onStatusChange]);

  return (
    <div
      aria-label="Interactive base map focused on Kigali City and Bugesera District"
      className="maplibre-mount"
      ref={containerRef}
      role="application"
    />
  );
}
