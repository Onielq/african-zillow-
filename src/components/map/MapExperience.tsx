"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { gsap } from "gsap";
import type { Map as MapLibreMapInstance } from "maplibre-gl";
import { MapView, type BasemapStatus } from "@/components/map/MapView";

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
    zoom: 10.2
  },
  {
    id: "bugesera",
    label: "Bugesera",
    center: [30.18, -2.28],
    zoom: 10.2
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

function getStatusLabel(status: BasemapStatus) {
  if (status === "ready") return "Basemap connected";
  if (status === "error") return "Basemap could not load";
  return "Loading basemap";
}

export function MapExperience() {
  const [mapInstance, setMapInstance] = useState<MapLibreMapInstance | null>(
    null
  );
  const [basemapStatus, setBasemapStatus] =
    useState<BasemapStatus>("loading");
  const [activeFocus, setActiveFocus] = useState<FocusArea>("combined");
  const toolbarRef = useRef<HTMLDivElement>(null);
  const focusRef = useRef<HTMLDivElement>(null);

  const handleMapReady = useCallback(
    (map: MapLibreMapInstance | null) => setMapInstance(map),
    []
  );

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

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

  const focusMap = (focus: FocusArea) => {
    setActiveFocus(focus);

    const option = FOCUS_OPTIONS.find((item) => item.id === focus);

    if (!option || !mapInstance) {
      return;
    }

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
          onStatusChange={setBasemapStatus}
        />

        <div className="map-vignette" aria-hidden="true" />

        <div className="map-status-card">
          <span
            aria-hidden="true"
            className={`status-dot status-dot-${basemapStatus}`}
          />
          <span aria-live="polite">{getStatusLabel(basemapStatus)}</span>
          <span className="status-divider" />
          <span className="status-secondary">Kigali City &amp; Bugesera</span>
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
                <span aria-hidden="true" className="control-chevron">
                  ⌄
                </span>
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

        <aside aria-label="Data availability" className="data-note">
          <div className="data-note-heading">
            <span aria-hidden="true" className="data-note-icon">
              i
            </span>
            <strong>Land layers are next</strong>
          </div>
          <p>
            Parcel boundaries, official zoning, and listing counts are not
            connected yet. The map below is a live base map, not a land-record
            or ownership map.
          </p>
        </aside>
      </section>
    </main>
  );
}
