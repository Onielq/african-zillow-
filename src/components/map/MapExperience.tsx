"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { gsap } from "gsap";
import type { Map as MapLibreMapInstance } from "maplibre-gl";
import {
  MapView,
  type BasemapStatus,
  type BoundaryStatus,
  type BasemapMode,
  type SelectedArea
} from "@/components/map/MapView";

type FocusArea = "combined" | "kigali" | "bugesera";
type WorkspaceMode = "areas" | "projects";
type PropertyScope = "all" | "residential" | "land";
type AnalysisPeriod = "3m" | "6m" | "12m";
type MarketMetric =
  | "averageLandPricePerM2"
  | "transactionVolume"
  | "capitalAppreciation"
  | "rentalYield"
  | "marketSupply"
  | "upcomingSupply";

const MARKET_METRICS: Array<{
  id: MarketMetric;
  label: string;
  shortLabel: string;
  description: string;
  dataStatus: string;
}> = [
  {
    id: "averageLandPricePerM2",
    label: "Average land price / m²",
    shortLabel: "Land price / m²",
    description: "Published average land price by district, in Rwandan francs per square metre.",
    dataStatus: "A sourced district snapshot is mapped for the four pilot districts. The source page does not expose the observation date, and this is not a house-sale price series."
  },
  {
    id: "transactionVolume",
    label: "Transaction volume",
    shortLabel: "Transactions",
    description: "How many registered land transactions take place in an area.",
    dataStatus: "The Rwanda Land Dashboard publishes aggregate transaction summaries. The data feed and geographic join are not connected yet."
  },
  {
    id: "capitalAppreciation",
    label: "Capital appreciation",
    shortLabel: "Appreciation",
    description: "How comparable prices changed over a selected period.",
    dataStatus: "The Rwanda Land Dashboard displays a land-price trend, but its time series is not connected and validated here. It must not be treated as a house-price index."
  },
  {
    id: "rentalYield",
    label: "Rental yield",
    shortLabel: "Rental yield",
    description: "Annual rent relative to purchase price, before costs.",
    dataStatus: "Verified rent and sale-price records are both required; neither feed is connected."
  },
  {
    id: "marketSupply",
    label: "Market supply",
    shortLabel: "Market supply",
    description: "Properties actively available to buy or rent.",
    dataStatus: "Active property inventory is not connected. Registered parcel totals are not the same as properties for sale."
  },
  {
    id: "upcomingSupply",
    label: "Upcoming supply",
    shortLabel: "Upcoming supply",
    description: "Verified planned developments and units expected to enter the market.",
    dataStatus: "A verified developer and construction pipeline is not connected."
  }
];

const PROPERTY_SCOPES: Array<{ value: PropertyScope; label: string }> = [
  { value: "all", label: "All property" },
  { value: "residential", label: "Residential" },
  { value: "land", label: "Land" }
];

const ANALYSIS_PERIODS: Array<{ value: AnalysisPeriod; label: string }> = [
  { value: "3m", label: "3 months" },
  { value: "6m", label: "6 months" },
  { value: "12m", label: "12 months" }
];

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

const PILOT_DISTRICT_SEARCH_AREAS: SelectedArea[] = [
  {
    level: "district",
    name: "Gasabo",
    province: "Kigali City",
    district: "Gasabo",
    districtId: null,
    sector: null,
    sectorId: null,
    cell: null,
    cellId: null,
    village: null,
    villageId: null,
    averageLandPricePerM2: 36013,
    sourceLabel: "Rwanda Land Dashboard · observation date not exposed",
    sourceType: "administrative-boundary"
  },
  {
    level: "district",
    name: "Kicukiro",
    province: "Kigali City",
    district: "Kicukiro",
    districtId: null,
    sector: null,
    sectorId: null,
    cell: null,
    cellId: null,
    village: null,
    villageId: null,
    averageLandPricePerM2: 61491,
    sourceLabel: "Rwanda Land Dashboard · observation date not exposed",
    sourceType: "administrative-boundary"
  },
  {
    level: "district",
    name: "Nyarugenge",
    province: "Kigali City",
    district: "Nyarugenge",
    districtId: null,
    sector: null,
    sectorId: null,
    cell: null,
    cellId: null,
    village: null,
    villageId: null,
    averageLandPricePerM2: 50735,
    sourceLabel: "Rwanda Land Dashboard · observation date not exposed",
    sourceType: "administrative-boundary"
  },
  {
    level: "district",
    name: "Bugesera",
    province: "Eastern Province",
    district: "Bugesera",
    districtId: null,
    sector: null,
    sectorId: null,
    cell: null,
    cellId: null,
    village: null,
    villageId: null,
    averageLandPricePerM2: 4033,
    sourceLabel: "Rwanda Land Dashboard · observation date not exposed",
    sourceType: "administrative-boundary"
  }
];

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
    case "parcel":
      return [
        area.village ? `${area.village} Village` : null,
        area.cell ? `${area.cell} Cell` : null,
        area.sector ? `${area.sector} Sector` : null,
        `${area.district} District`
      ]
        .filter(Boolean)
        .join(" · ");
  }
}

export function MapExperience() {
  const [basemapMode, setBasemapMode] = useState<BasemapMode>("map");
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("areas");
  const [selectedMetric, setSelectedMetric] =
    useState<MarketMetric>("averageLandPricePerM2");
  const [propertyScope, setPropertyScope] = useState<PropertyScope>("land");
  const [analysisPeriod, setAnalysisPeriod] = useState<AnalysisPeriod>("12m");
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [metricInfoOpen, setMetricInfoOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareSearch, setCompareSearch] = useState("");
  const [comparedAreas, setComparedAreas] = useState<SelectedArea[]>([]);
  const [comparisonFeedback, setComparisonFeedback] = useState("");
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

  const addAreaToComparison = (areaToAdd: SelectedArea) => {
    const exists = comparedAreas.some(
      (area) =>
        area.level === areaToAdd.level &&
        area.name === areaToAdd.name &&
        area.district === areaToAdd.district
    );

    if (exists) {
      setComparisonFeedback(`${areaToAdd.name} is already on your comparison list.`);
      setCompareOpen(true);
      return;
    }

    if (comparedAreas.length >= 4) {
      setComparisonFeedback("Compare up to four areas. Remove one to add another.");
      setCompareOpen(true);
      return;
    }

    setComparedAreas((areas) => [...areas, areaToAdd]);
    setComparisonFeedback(`${areaToAdd.name} added to comparison.`);
    setCompareOpen(true);
  };

  const addSelectedAreaToComparison = () => {
    if (!selectedArea) return;
    addAreaToComparison(selectedArea);
  };

  const removeComparedArea = (areaToRemove: SelectedArea) => {
    setComparedAreas((areas) =>
      areas.filter(
        (area) =>
          !(
            area.level === areaToRemove.level &&
            area.name === areaToRemove.name &&
            area.district === areaToRemove.district
          )
      )
    );
    setComparisonFeedback("");
  };

  const activeMetric =
    MARKET_METRICS.find((metric) => metric.id === selectedMetric) ??
    MARKET_METRICS[0];
  const normalizedComparisonSearch = compareSearch.trim().toLocaleLowerCase();
  const comparisonSearchResults = normalizedComparisonSearch
    ? PILOT_DISTRICT_SEARCH_AREAS.filter((area) =>
        area.name.toLocaleLowerCase().includes(normalizedComparisonSearch)
      )
    : [];

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
    if (!compareOpen && !metricInfoOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setCompareOpen(false);
        setMetricInfoOpen(false);
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [compareOpen, metricInfoOpen]);

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
            aria-expanded={compareOpen}
            className="compare-control"
            onClick={() => {
              setSourcesOpen(false);
              setCompareOpen((open) => !open);
            }}
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
            Compare{comparedAreas.length > 0 ? ` · ${comparedAreas.length}/4` : ""}
          </button>
          <Link className="compare-control" href="/data-sources">
            Data sources
          </Link>
        </nav>

        <div aria-label="Application modes" className="topbar-actions">
          <button
            aria-pressed={workspaceMode === "areas"}
            className={workspaceMode === "areas" ? "mode-chip mode-chip-active" : "mode-chip"}
            onClick={() => {
              setWorkspaceMode("areas");
              setSelectedArea(null);
            }}
            type="button"
          >
            Areas
          </button>
          <button
            aria-pressed={workspaceMode === "projects"}
            className={workspaceMode === "projects" ? "mode-chip mode-chip-active" : "mode-chip"}
            onClick={() => {
              setWorkspaceMode("projects");
              setSelectedArea(null);
            }}
            type="button"
          >
            Projects
          </button>
        </div>
      </header>

      <section aria-label="Map workspace" className="map-workspace">
        <MapView
          basemapMode={basemapMode}
          showLandPriceHeatmap={selectedMetric === "averageLandPricePerM2"}
          onMapReady={handleMapReady}
          onStatusChange={handleBasemapStatus}
          onBoundaryStatusChange={handleBoundaryStatus}
          onAreaSelected={handleAreaSelected}
        />

        <div className="map-vignette" aria-hidden="true" />

        <div className="basemap-switcher" role="group" aria-label="Basemap view">
          <button
            aria-pressed={basemapMode === "map"}
            className={basemapMode === "map" ? "basemap-button basemap-button-active" : "basemap-button"}
            onClick={() => setBasemapMode("map")}
            type="button"
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
              <path d="m2.5 5.2 5-2.1 5 2.1 5-2.1v11.7l-5 2.1-5-2.1-5 2.1V5.2Z" stroke="currentColor" strokeWidth="1.35" strokeLinejoin="round" />
              <path d="M7.5 3.3v11.6m5-9.7v11.6" stroke="currentColor" strokeWidth="1.2" />
            </svg>
            Map
          </button>
          <button
            aria-pressed={basemapMode === "satellite"}
            className={basemapMode === "satellite" ? "basemap-button basemap-button-active" : "basemap-button"}
            onClick={() => setBasemapMode("satellite")}
            type="button"
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
              <path d="m10 2.2 2.15 2.15-2.15 2.15-2.15-2.15L10 2.2Z" stroke="currentColor" strokeWidth="1.35" strokeLinejoin="round" />
              <path d="m4.6 7.6 2.15 2.15L4.6 11.9 2.45 9.75 4.6 7.6Zm10.8 0 2.15 2.15-2.15 2.15-2.15-2.15 2.15-2.15Z" stroke="currentColor" strokeWidth="1.35" strokeLinejoin="round" />
              <path d="m10 12.2 2.15 2.15L10 16.5l-2.15-2.15L10 12.2Z" stroke="currentColor" strokeWidth="1.35" strokeLinejoin="round" />
            </svg>
            Satellite
          </button>
        </div>

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
          <div aria-label="Investment map filters" className="map-toolbar investment-toolbar">
            <label className="investment-field investment-field-metric">
              <span>Metric</span>
              <select
                aria-label="Market metric"
                className="toolbar-select"
                value={selectedMetric}
                onChange={(event) => {
                  const metric = event.target.value as MarketMetric;
                  setSelectedMetric(metric);
                  if (
                    metric === "averageLandPricePerM2" ||
                    metric === "transactionVolume" ||
                    metric === "capitalAppreciation"
                  ) {
                    setPropertyScope("land");
                  } else {
                    setPropertyScope("all");
                  }
                }}
              >
                {MARKET_METRICS.map((metric) => (
                  <option key={metric.id} value={metric.id}>{metric.label}</option>
                ))}
              </select>
            </label>
            <label className="investment-field">
              <span>Type</span>
              <select
                aria-label="Property type"
                className="toolbar-select"
                disabled={
                  selectedMetric === "averageLandPricePerM2" ||
                  selectedMetric === "transactionVolume" ||
                  selectedMetric === "capitalAppreciation"
                }
                value={
                  selectedMetric === "averageLandPricePerM2" ||
                  selectedMetric === "transactionVolume" ||
                  selectedMetric === "capitalAppreciation"
                    ? "land"
                    : propertyScope
                }
                onChange={(event) => setPropertyScope(event.target.value as PropertyScope)}
              >
                {(selectedMetric === "averageLandPricePerM2" ||
                selectedMetric === "transactionVolume" ||
                selectedMetric === "capitalAppreciation"
                  ? PROPERTY_SCOPES.filter((scope) => scope.value === "land")
                  : PROPERTY_SCOPES
                ).map((scope) => (
                  <option key={scope.value} value={scope.value}>{scope.label}</option>
                ))}
              </select>
            </label>
            <label className="investment-field investment-field-period">
              <span>Period</span>
              <select
                aria-label="Analysis period"
                className="toolbar-select"
                disabled={selectedMetric === "averageLandPricePerM2"}
                title={
                  selectedMetric === "averageLandPricePerM2"
                    ? "The available district price snapshot has no observation date; period filtering is not applied."
                    : undefined
                }
                value={analysisPeriod}
                onChange={(event) => setAnalysisPeriod(event.target.value as AnalysisPeriod)}
              >
                {ANALYSIS_PERIODS.map((period) => (
                  <option key={period.value} value={period.value}>{period.label}</option>
                ))}
              </select>
            </label>
            <button
              aria-expanded={sourcesOpen}
              className={sourcesOpen ? "toolbar-action toolbar-action-active" : "toolbar-action"}
              onClick={() => {
                setCompareOpen(false);
                setMetricInfoOpen(false);
                setSourcesOpen((open) => !open);
              }}
              type="button"
            >
              Sources
            </button>
            <button
              aria-label={`Definition for ${activeMetric.label}`}
              aria-expanded={metricInfoOpen}
              className={metricInfoOpen ? "toolbar-action toolbar-action-active metric-info-trigger" : "toolbar-action metric-info-trigger"}
              onClick={() => {
                setCompareOpen(false);
                setSourcesOpen(false);
                setMetricInfoOpen((open) => !open);
              }}
              type="button"
            >
              <span aria-hidden="true">i</span>
            </button>
          </div>
        </div>

        {metricInfoOpen ? (
          <aside aria-label={`Definition for ${activeMetric.label}`} className="metric-info-panel">
            <button
              aria-label="Close metric definition"
              className="panel-close"
              onClick={() => setMetricInfoOpen(false)}
              type="button"
            >
              ×
            </button>
            <p className="panel-eyebrow">METRIC DEFINITION</p>
            <h2>{activeMetric.label}</h2>
            <p className="metric-info-description">{activeMetric.description}</p>
            <div className="metric-info-unit">
              <span>Expected unit</span>
              <strong>
                {selectedMetric === "averageLandPricePerM2"
                  ? "RWF per m²"
                  : selectedMetric === "transactionVolume"
                    ? "Registered land transactions"
                    : selectedMetric === "capitalAppreciation" || selectedMetric === "rentalYield"
                      ? "Percent (%)"
                      : "Count of verified records"}
              </strong>
            </div>
            <div className="metric-info-status">
              <strong>Data status</strong>
              <p>{activeMetric.dataStatus}</p>
            </div>
            {selectedMetric === "averageLandPricePerM2" ? (
              <a className="metric-info-source" href="https://rwandalanddashboard.lands.rw/prices" target="_blank" rel="noreferrer">
                Open Rwanda Land Dashboard ↗
              </a>
            ) : selectedMetric === "transactionVolume" || selectedMetric === "capitalAppreciation" ? (
              <a className="metric-info-source" href="https://data.gov.rw/datasets/3cee397e-8da0-418f-a382-b97feffba7ed" target="_blank" rel="noreferrer">
                Review transaction dataset and access terms ↗
              </a>
            ) : (
              <p className="metric-info-no-source">No validated Rwanda source is connected for this metric yet.</p>
            )}
          </aside>
        ) : null}

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
            {selectedArea.level === "parcel" ? (
              <div className="parcel-details">
                <div>
                  <span>Unique parcel identifier (UPI)</span>
                  <strong>{selectedArea.upi ?? "Not published"}</strong>
                </div>
                <div>
                  <span>Parcel number</span>
                  <strong>{selectedArea.parcelNumber ?? "Not published"}</strong>
                </div>
                <div>
                  <span>Parcel area</span>
                  <strong>
                    {typeof selectedArea.parcelSizeM2 === "number"
                      ? `${new Intl.NumberFormat("en-RW", { maximumFractionDigits: 0 }).format(selectedArea.parcelSizeM2)} m²`
                      : "Not published"}
                  </strong>
                </div>
                {typeof selectedArea.wetlandAreaM2 === "number" && selectedArea.wetlandAreaM2 > 0 ? (
                  <div>
                    <span>Area intersecting wetlands</span>
                    <strong>{new Intl.NumberFormat("en-RW", { maximumFractionDigits: 0 }).format(selectedArea.wetlandAreaM2)} m²</strong>
                  </div>
                ) : null}
                <div>
                  <span>Last updated in source</span>
                  <strong>
                    {typeof selectedArea.lastUpdatedOn === "number"
                      ? new Date(selectedArea.lastUpdatedOn).toLocaleDateString("en-RW")
                      : "Date not supplied"}
                  </strong>
                </div>
              </div>
            ) : (
              <>
                <div aria-label="Selected area market metrics" className="area-market-grid">
                  <article className="area-market-card area-market-card-featured">
                    <span>Average land price / m²</span>
                    <strong>
                      {selectedArea.level === "district" && selectedArea.averageLandPricePerM2 !== null
                        ? `${new Intl.NumberFormat("en-RW", { maximumFractionDigits: 0 }).format(selectedArea.averageLandPricePerM2)} RWF`
                        : "Not available"}
                    </strong>
                    <small>
                      {selectedArea.level === "district" && selectedArea.averageLandPricePerM2 !== null
                        ? "Rwanda Land Dashboard · observation date not exposed"
                        : "No finer-level value is mapped; district averages are not reused for smaller areas."}
                    </small>
                  </article>
                  <article className="area-market-card">
                    <span>Transaction volume</span>
                    <strong>Not connected</strong>
                    <small>Approved transaction aggregates are not yet joined to this area.</small>
                  </article>
                  <article className="area-market-card">
                    <span>Rental yield</span>
                    <strong>Not connected</strong>
                    <small>Verified rental and comparable value records are required.</small>
                  </article>
                  <article className="area-market-card">
                    <span>New projects</span>
                    <strong>Not connected</strong>
                    <small>No verified developer/project inventory is connected yet.</small>
                  </article>
                  <article className="area-market-card">
                    <span>Capital appreciation</span>
                    <strong>Not connected</strong>
                    <small>A validated comparable land-price time series is not connected.</small>
                  </article>
                  <article className="area-market-card">
                    <span>Upcoming supply</span>
                    <strong>Not connected</strong>
                    <small>Verified project stages and future unit counts are not available.</small>
                  </article>
                </div>
                <section aria-label="Projects in selected area" className="area-projects-empty">
                  <div className="area-projects-empty-heading">
                    <h3>Projects</h3>
                    <span>Not connected</span>
                  </div>
                  <p>
                    No verified developer or project inventory is connected yet. Project names,
                    prices, availability, sales progress and completion figures will appear only
                    when a permitted, current source is connected.
                  </p>
                </section>
              </>
            )}
            {getAreaParent(selectedArea) ? (
              <p className="panel-parent">Within {getAreaParent(selectedArea)}</p>
            ) : null}
            <button
              className="add-comparison-button"
              onClick={addSelectedAreaToComparison}
              type="button"
            >
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
                <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              Add to comparison
            </button>
            <div className="panel-divider" />
            <div className="source-status">
              <span className="source-status-mark" />
              {selectedArea.level === "parcel" ? "Land parcel identification" : "Administrative boundary"}
            </div>
            <p className="panel-copy">
              {selectedArea.sourceLabel ?? "Official administrative GIS source"}
            </p>
            <div className="panel-notice">
              <strong>
                {selectedArea.level === "parcel"
                  ? "Verify legal title before a transaction"
                  : "Area boundaries are not individual plots"}
              </strong>
              <p>
                {selectedArea.level === "parcel"
                  ? `The selected UPI and parcel outline come from: ${selectedArea.sourceLabel ?? "the connected cadastral source"}. Some attributes, including parcel area, may not be available for every district. This map identifies the plot; it does not prove legal title, ownership, restrictions or current survey accuracy. Confirm those details with the competent land authority before a transaction.`
                  : "Zoom further to see individual parcel outlines from the connected cadastral feeds. Kigali and Bugesera parcel polygons are connected; the map will not invent plot edges from roads, satellite imagery or zoning."}
              </p>
            </div>
          </aside>
        ) : (
          <aside aria-label={workspaceMode === "projects" ? "Project data status" : "Market metric data status"} className="data-note">
            <div className="data-note-heading">
              <span aria-hidden="true" className="data-note-icon">i</span>
              <strong>
                {boundaryStatus === "error"
                  ? "Boundary service unavailable"
                  : workspaceMode === "projects"
                    ? "Projects mode"
                    : activeMetric.label}
              </strong>
            </div>
            {workspaceMode === "projects" ? (
              <p>
                Project mode is ready for a verified project feed, but developer
                launches, starting prices, payment plans, construction progress
                and unit availability are not connected yet. No project markers
                or prices are fabricated.
              </p>
            ) : (
              <>
                <p>{activeMetric.description}</p>
                <p className="metric-status-copy">{activeMetric.dataStatus}</p>
                {selectedMetric === "averageLandPricePerM2" ? (
                  <div className="land-price-legend" aria-label="Land price heatmap legend">
                    <span>RWF/m²</span>
                    <div className="land-price-legend-scale" />
                    <div className="land-price-legend-labels"><span>Lower</span><span>Higher</span></div>
                  </div>
                ) : null}
                <p>
                  Current filters: {selectedMetric === "averageLandPricePerM2" ? "Land · static district snapshot" : `${PROPERTY_SCOPES.find((item) => item.value === propertyScope)?.label} · ${ANALYSIS_PERIODS.find((item) => item.value === analysisPeriod)?.label}`}.
                  {selectedMetric === "averageLandPricePerM2"
                    ? "District polygons are shaded by the sourced land-price snapshot. Period filtering is not applied because the source observation date is not exposed; finer-level prices are not inferred."
                    : "The map keeps administrative colors for this metric until verified market data can be joined to the polygons."}
                </p>
              </>
            )}
            <p className="data-source-note">
              Administrative boundaries: Kigali City Master Plan and Geodata Rwanda Bugesera Masterplan. Individual parcel polygons: City of Kigali parcel layer for Kigali and an NLA-hosted LAIS Bugesera_Parcels service for Bugesera. Bugesera reuse terms, completeness and current survey accuracy still need confirmation; zoning layers remain separate.
            </p>
          </aside>
        )}

        {sourcesOpen ? (
          <aside aria-label="Market data sources" className="sources-panel">
            <button
              aria-label="Close data sources"
              className="panel-close"
              onClick={() => setSourcesOpen(false)}
              type="button"
            >
              ×
            </button>
            <p className="panel-eyebrow">DATA REGISTER</p>
            <h2>Market data sources</h2>
            <div className="source-register-item">
              <span className="source-register-status source-register-connected" />
              <div>
                <strong>Administrative boundaries</strong>
                <p>Connected · Kigali City Master Plan + Geodata Rwanda Bugesera Masterplan</p>
              </div>
            </div>
            <div className="source-register-item">
              <span className="source-register-status source-register-connected" />
              <div>
                <strong>Individual land parcels</strong>
                <p>Polygon + UPI connected for Kigali and Bugesera. Kigali additionally exposes parcel number, area, wetland overlap and update date. Bugesera reuse terms, completeness and survey accuracy still need confirmation.</p>
              </div>
            </div>
            <div className="source-register-item">
              <span className="source-register-status source-register-pending" />
              <div>
                <strong>Land transaction summaries</strong>
                <p>Source identified · normalized feed not connected</p>
              </div>
            </div>
            <div className="source-register-item">
              <span className="source-register-status source-register-pending" />
              <div>
                <strong>Average district land prices</strong>
                <p>Initial RWF/m² snapshot mapped for four pilot districts; live feed and source observation date need validation</p>
              </div>
            </div>
            <div className="source-register-item">
              <span className="source-register-status source-register-pending" />
              <div>
                <strong>Rental yields and house-sale prices</strong>
                <p>Verified house-price and rent records still required</p>
              </div>
            </div>
            <div className="source-register-item">
              <span className="source-register-status source-register-pending" />
              <div>
                <strong>Projects and upcoming supply</strong>
                <p>Developer and construction pipeline required</p>
              </div>
            </div>
            <a
              className="source-register-link"
              href="https://masterplan.kigalicity.gov.rw/portal/apps/webappviewer/index.html?id=fdd2e30cbc15401d9daee5f68982d755"
              rel="noreferrer"
              target="_blank"
            >
              Open Kigali Master Plan map ↗
            </a>
            <a
              className="source-register-link"
              href="https://geodata.rw/portal/apps/experiencebuilder/experience/?id=8b259ba9599747898ca728dba4e6d215"
              rel="noreferrer"
              target="_blank"
            >
              Open Bugesera Masterplan map ↗
            </a>
            <a
              className="source-register-link"
              href="https://services7.arcgis.com/htgaiKX6RV2DDGgK/arcgis/rest/services/Bugesera_Parcels/FeatureServer/0"
              rel="noreferrer"
              target="_blank"
            >
              Open NLA Bugesera parcel layer ↗
            </a>
            <a
              className="source-register-link"
              href="https://rwandalanddashboard.lands.rw/prices"
              rel="noreferrer"
              target="_blank"
            >
              Open National Land Dashboard prices ↗
            </a>
            <a
              className="source-register-link"
              href="https://data.gov.rw/datasets"
              rel="noreferrer"
              target="_blank"
            >
              Open Rwanda Data Sharing Platform ↗
            </a>
            <p className="data-source-note">
              Public land-summary datasets describe aggregated records, not
              individual title documents. The Bugesera cadastral endpoint exposes polygon + UPI in the checked sample; permission to reuse/redistribute, data completeness and current survey accuracy must be confirmed before commercial reliance.
            </p>
          </aside>
        ) : null}

        {compareOpen ? (
          <button
            aria-label="Close comparison dialog"
            className="comparison-modal-backdrop"
            onClick={() => setCompareOpen(false)}
            type="button"
          />
        ) : null}

        {compareOpen ? (
          <aside
            aria-label="Area comparison dialog"
            aria-labelledby="comparison-title"
            aria-modal="true"
            className="comparison-panel"
            role="dialog"
          >
            <button
              aria-label="Close area comparison"
              className="panel-close"
              onClick={() => setCompareOpen(false)}
              type="button"
            >
              ×
            </button>
            <p className="panel-eyebrow">AREA COMPARISON</p>
            <div className="comparison-title-row">
              <div>
                <h2 id="comparison-title">Compare areas</h2>
                <p className="comparison-subtitle">Select up to four areas to compare side by side.</p>
              </div>
              <span>{comparedAreas.length}/4 selected</span>
            </div>
            <label className="comparison-search-label" htmlFor="comparison-area-search">Search by district</label>
            <input
              autoComplete="off"
              className="comparison-search"
              id="comparison-area-search"
              onChange={(event) => setCompareSearch(event.target.value)}
              placeholder="Search by district name"
              type="search"
              value={compareSearch}
            />
            {normalizedComparisonSearch ? (
              <div aria-label="Matching pilot districts" className="comparison-search-results" role="listbox">
                {comparisonSearchResults.length > 0 ? comparisonSearchResults.map((area) => {
                  const isAdded = comparedAreas.some((existing) =>
                    existing.level === area.level &&
                    existing.name === area.name &&
                    existing.district === area.district
                  );
                  const atLimit = comparedAreas.length >= 4 && !isAdded;
                  return (
                    <button
                      aria-selected={isAdded}
                      className="comparison-search-result"
                      disabled={isAdded || atLimit}
                      key={area.name}
                      onClick={() => {
                        addAreaToComparison(area);
                        if (!isAdded && !atLimit) setCompareSearch("");
                      }}
                      role="option"
                      type="button"
                    >
                      <span className="comparison-search-dot" aria-hidden="true" />
                      <span className="comparison-search-result-copy">
                        <strong>{area.name}</strong>
                        <small>{area.province} · District · pilot geography</small>
                      </span>
                      <span className="comparison-search-result-action">{isAdded ? "Added" : atLimit ? "Limit reached" : "Add"}</span>
                    </button>
                  );
                }) : (
                  <p className="comparison-no-results">No pilot district matched “{compareSearch.trim()}”. Smaller areas can still be added from the map.</p>
                )}
              </div>
            ) : null}
            {comparisonFeedback ? (
              <p aria-live="polite" className="comparison-feedback">{comparisonFeedback}</p>
            ) : null}
            {comparedAreas.length === 0 ? (
              <div className="comparison-empty">
                <span aria-hidden="true" className="comparison-empty-pin">⌖</span>
                <strong>No areas selected</strong>
                <p>Search a pilot district above or select a smaller area on the map and choose “Add to comparison”.</p>
              </div>
            ) : (
              <>
                <div className="comparison-area-list">
                  <div className="comparison-selected-chips">
                    {comparedAreas.map((area) => (
                      <span
                        className="comparison-chip"
                        key={`${area.level}-${area.district}-${area.name}`}
                      >
                        <span>{area.name}</span>
                        <button
                          aria-label={`Remove ${area.name} from comparison`}
                          className="comparison-chip-remove"
                          onClick={() => removeComparedArea(area)}
                          type="button"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  <button
                    className="comparison-clear-inline"
                    disabled={comparedAreas.length === 0}
                    onClick={() => {
                      setComparedAreas([]);
                      setComparisonFeedback("");
                    }}
                    type="button"
                  >
                    Clear all
                  </button>
                </div>
                <div className="comparison-table-scroll">
                  <table className="comparison-table">
                    <thead>
                      <tr>
                        <th scope="col">Metric</th>
                        {comparedAreas.map((area) => (
                          <th
                            scope="col"
                            key={`${area.level}-${area.district}-${area.name}`}
                          >
                            {area.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {MARKET_METRICS.map((metric) => (
                        <tr key={metric.id}>
                          <th scope="row">{metric.shortLabel}</th>
                          {comparedAreas.map((area) => {
                            const landPrice =
                              metric.id === "averageLandPricePerM2" &&
                              area.level === "district"
                                ? area.averageLandPricePerM2
                                : null;
                            return (
                              <td key={`${metric.id}-${area.level}-${area.district}-${area.name}`}>
                                {landPrice !== null
                                  ? `${new Intl.NumberFormat("en-RW", { maximumFractionDigits: 0 }).format(landPrice)} RWF/m²`
                                  : metric.id === "averageLandPricePerM2" && area.level !== "district"
                                    ? "No value at this level"
                                    : "Pending"}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="data-source-note">
                  The district land-price snapshot is populated where available.
                  Other metrics are pending validated data feeds; finer-level
                  prices are not inferred from district averages.
                </p>
                <button
                  className="comparison-clear"
                  onClick={() => {
                    setComparedAreas([]);
                    setComparisonFeedback("");
                  }}
                  type="button"
                >
                  Clear shortlist
                </button>
              </>
            )}
          </aside>
        ) : null}
      </section>
    </main>
  );
}
