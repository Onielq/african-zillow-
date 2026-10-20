"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { gsap } from "gsap";
import type { Map as MapLibreMapInstance } from "maplibre-gl";
import {
  MapView,
  type BasemapStatus,
  type BoundaryStatus,
  type SelectedArea
} from "@/components/map/MapView";

type FocusArea = "combined" | "kigali" | "bugesera";

const FOCUS_OPTIONS: Array<{
  id: FocusArea;
  label: string;
  center: [number, number];
  zoom: number;
}> = [
  {
    id: "combined",
    label: "Kigali + Bugesera",
    center: [30.13, -2.1],
    zoom: 8.35
  },
  {
    id: "kigali",
    label: "Kigali City",
    center: [30.0619, -1.9441],
    zoom: 9.35
  },
  {
    id: "bugesera",
    label: "Bugesera",
    center: [30.18, -2.28],
    zoom: 9.35
  }
];

const TOOLBAR_ITEMS = ["Developers", "Projects", "Metrics", "Sources", "Show"];

function BrandMark() {
  return (
    <svg
      aria-hidden="true"
      className="brand-mark"
      viewBox="0 0 40 40"
      fill="none"
    >
      <rect x="1" y="1" width="38" height="38" rx="12" fill="currentColor" />
      <path
        d="M10 11.5 19.5 7l10.5 5.2v14.2L19.5 33 10 27.6V11.5Z"
        stroke="white"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="m10.5 19 9 5.2 10.1-5.5M19.5 24.2V32"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="19.5" cy="18" r="2.4" fill="white" />
    </svg>
  );
}

function getBasemapLabel(status: BasemapStatus) {
  if (status === "ready") return "Basemap connected";
  if (status === "error") return "Basemap could not load";
  return "Loading basemap";
}

function getBoundaryLabel(status: BoundaryStatus) {
  if (status === "ready") return "Administrative boundaries loaded";
  if (status === "error") return "Boundary service unavailable";
  return "Loading administrative boundaries";
}

function getAreaParent(area: SelectedArea): string | null {
  switch (area.level) {
    case "district":
      return area.province;
    case "sector":
      return `${area.district} District`;
    case "cell":
      return [area.sector ? `${area.sector} Sector` : null, `${area.district} District`]
        .filter(Boolean)
        .join(" · ");
    case "village":
      return [
        area.cell ? `${area.cell} Cell` : null,
        area.sector ? `${area.sector} Sector` : null,
        `${area.district} District`
      ]
        .filter(Boolean)
        .join(" · ");
  }
}

export function MapExperience() {
  const [mapInstance, setMapInstance] = useState<MapLibreMapInstance | null>(
    null
  );
  const [basemapStatus, setBasemapStatus] =
    useState<BasemapStatus>("loading");
  const [boundaryStatus, setBoundaryStatus] =
    useState<BoundaryStatus>("loading");
  const [activeFocus, setActiveFocus] = useState<FocusArea>("combined");
  const [selectedArea, setSelectedArea] = useState<SelectedArea | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const focusRef = useRef<HTMLDivElement>(null);
  const areaPanelRef = useRef<HTMLElement>(null);

  const handleMapReady = useCallback(
    (map: MapLibreMapInstance | null) => setMapInstance(map),
    []
  );
  const handleAreaSelected = useCallback(
    (area: SelectedArea | null) => setSelectedArea(area),
    []
  );
  const handleBasemapStatus = useCallback(
    (status: BasemapStatus) => setBasemapStatus(status),
    []
  );
  const handleBoundaryStatus = useCallback(
    (status: BoundaryStatus) => setBoundaryStatus(status),
    []
  );

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const context = gsap.context(() => {
      gsap.fromTo(
        [toolbarRef.current, focusRef.current],
        { y: -9, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.42,
          stagger: 0.07,
          ease: "power2.out",
          clearProps: "transform"
        }
      );
    });

    return () => context.revert();
  }, []);

  useEffect(() => {
    if (!selectedArea || !areaPanelRef.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const context = gsap.context(() => {
      gsap.fromTo(
        areaPanelRef.current,
        { x: -12, opacity: 0 },
        { x: 0, opacity: 1, duration: 0.28, ease: "power2.out" }
      );
    }, areaPanelRef);

    return () => context.revert();
  }, [selectedArea]);

  const focusMap = (focus: FocusArea) => {
    setActiveFocus(focus);

    const option = FOCUS_OPTIONS.find((item) => item.id === focus);
    if (!option || !mapInstance) return;

    setSelectedArea(null);
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    mapInstance.flyTo({
      center: option.center,
      zoom: option.zoom,
      duration: reduceMotion ? 0 : 680,
      essential: false
    });
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <Link aria-label="Rwanda Land Intelligence home" className="brand" href="/">
          <BrandMark />
          <span className="brand-copy">
            <span className="brand-name">Land Intelligence</span>
            <span className="brand-country">RWANDA</span>
          </span>
        </Link>

        <nav aria-label="Primary navigation" className="primary-navigation">
          <button
            className="compare-control"
            disabled
            title="Area comparison will be connected after market data is available."
            type="button"
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
              <path
                d="M7 4H3v12h4M13 4h4v12h-4M7 7h6M7 10h6M7 13h6"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Compare
          </button>
        </nav>

        <div aria-label="Application modes" className="topbar-actions">
          <span aria-current="page" className="mode-chip mode-chip-active">
            Areas
          </span>
          <button
            className="mode-chip"
            disabled
            title="Projects will be developed in a later phase."
            type="button"
          >
            Projects
          </button>
        </div>
      </header>

      <section aria-label="Map workspace" className="map-workspace">
        <MapView
          onMapReady={handleMapReady}
          onStatusChange={handleBasemapStatus}
          onBoundaryStatusChange={handleBoundaryStatus}
          onAreaSelected={handleAreaSelected}
        />

        <div className="map-vignette" aria-hidden="true" />

        <div className="map-status-card">
          <span
            aria-hidden="true"
            className={`status-dot status-dot-${basemapStatus}`}
          />
          <span aria-live="polite">{getBasemapLabel(basemapStatus)}</span>
          <span className="status-divider" />
          <span
            aria-hidden="true"
            className={`status-dot status-dot-${boundaryStatus}`}
          />
          <span aria-live="polite" className="status-secondary">
            {getBoundaryLabel(boundaryStatus)}
          </span>
        </div>

        <div className="map-floating-toolbar" ref={toolbarRef}>
          <nav aria-label="Map tools" className="map-toolbar">
            {TOOLBAR_ITEMS.map((label) => (
              <button
                aria-label={`${label}, planned for a later phase`}
                className="toolbar-control"
                disabled
                key={label}
                title="This tool will be connected in a later phase."
                type="button"
              >
                {label}
                <span aria-hidden="true" className="control-chevron">⌄</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="map-focus-panel" ref={focusRef}>
          <span className="focus-eyebrow">EXPLORE AREA</span>
          <div aria-label="Map focus" className="focus-options">
            {FOCUS_OPTIONS.map((option) => (
              <button
                aria-pressed={activeFocus === option.id}
                className={
                  activeFocus === option.id
                    ? "focus-button focus-button-active"
                    : "focus-button"
                }
                key={option.id}
                onClick={() => focusMap(option.id)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {selectedArea ? (
          <aside
            aria-label="Selected administrative area"
            aria-live="polite"
            className="selected-area-panel"
            ref={areaPanelRef}
          >
            <button
              aria-label="Close selected area panel"
              className="panel-close"
              onClick={() => setSelectedArea(null)}
              type="button"
            >
              ×
            </button>
            <p className="panel-eyebrow">{selectedArea.level.toUpperCase()}</p>
            <h2>{selectedArea.name}</h2>
            {getAreaParent(selectedArea) ? (
              <p className="panel-parent">Within {getAreaParent(selectedArea)}</p>
            ) : null}
            <div className="panel-divider" />
            <div className="source-status">
              <span className="source-status-mark" />
              Administrative boundary
            </div>
            <p className="panel-copy">
              This outline comes from the Rwanda Environment Ministry GIS
              boundary service. Its layer descriptions reference the 2022
              census. Reuse terms must be confirmed before production.
            </p>
            <div className="panel-notice">
              <strong>Land records not connected yet</strong>
              <p>
                This outline is an administrative area, not a cadastral plot.
                The official Rwanda Land Authority land-parcel feed is not
                connected or validated yet, so this map will not guess plot
                edges from roads, imagery, or village borders.
              </p>
            </div>
          </aside>
        ) : (
          <aside aria-label="Boundary layer information" className="data-note">
            <div className="data-note-heading">
              <span aria-hidden="true" className="data-note-icon">i</span>
              <strong>
                {boundaryStatus === "error"
                  ? "Boundary service unavailable"
                  : "Explore the land hierarchy"}
              </strong>
            </div>
            <p>
              Hover or click an area to identify it. Zoom through districts,
              sectors, cells, and villages. The ordinary road map stays visible
              beneath a light 20% area tint. These outlines are not land plots.
            </p>
            <p className="data-source-note">
              Admin source: Rwanda Environment Ministry GIS · 2022 census
              boundary basis. Geodata.rw / Rwanda Land Authority cadastral
              data still needs version, access, and reuse validation.
            </p>
          </aside>
        )}
      </section>
    </main>
  );
}
