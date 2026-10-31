"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Map as MapLibreMapInstance } from "maplibre-gl";
import { MapView, type BasemapMode, type MapOverlayCategory, type MapMetric, type BasemapStatus, type BoundaryStatus, type SelectedArea } from "@/components/map/MapView";
import {
  DISTRICT_LAND_PRICE_BENCHMARKS,
  LAND_PRICE_BENCHMARK_SOURCE,
  type DistrictLandPriceBenchmark
} from "@/data/land-price-benchmarks";
import {
  TRANSACTION_BENCHMARK_SOURCE,
  TRANSACTION_DISTRICT_BENCHMARKS
} from "@/data/transaction-benchmarks";
import styles from "./explorer-experience.module.css";

type AreaLevel = "district" | "sector" | "cell" | "village";
type SourceId = "kigali" | "bugesera";

type AreaSearchResult = {
  id: string;
  level: AreaLevel | "parcel";
  name: string;
  province: string;
  district: string;
  districtId: string | null;
  sector: string | null;
  sectorId: string | null;
  cell: string | null;
  cellId: string | null;
  village: string | null;
  villageId: string | null;
  averageLandPricePerM2: number | null;
  sourceLabel: string;
  sourceType: "administrative-boundary" | "cadastral-parcel";
  mapSourceId?: SourceId;
  sourceObjectId?: string | null;
  upi?: string | null;
  parcelNumber?: string | null;
  parcelSizeM2?: number | null;
  bounds?: [number, number, number, number] | null;
  center?: [number, number] | null;
};

type AreaSearchResponse = {
  areas?: AreaSearchResult[];
  error?: string;
  message?: string;
};

type TransactionEstimate = {
  district?: string;
  level?: AreaLevel;
  estimate?: number | null;
  status?: string;
  method?: string;
  unit?: string;
  annualTransactions2023?: number;
  currentMonthReported?: {
    count: number;
    observedOn: string;
    status: string;
    note: string;
  } | null;
};

type GeometryResponse = {
  bounds?: [number, number, number, number];
  center?: [number, number];
  error?: string;
};

type SearchStatus = "idle" | "loading" | "ready" | "error";
type ProfileStatus = "idle" | "loading" | "ready" | "not-found" | "error";
type MarketSignal = "appreciation" | "activity" | "value" | "development" | "nature";

const DISTRICTS = ["Gasabo", "Kicukiro", "Nyarugenge", "Bugesera"] as const;

const SIGNALS: Array<{
  id: MarketSignal;
  number: string;
  title: string;
  description: string;
  availability: string;
}> = [
  {
    id: "appreciation",
    number: "01",
    title: "Price appreciation",
    description: "Compare how recorded transaction prices change over time.",
    availability: "Historical village and parcel price series are not connected yet."
  },
  {
    id: "activity",
    number: "02",
    title: "Sales activity",
    description: "See where registered land transactions are taking place.",
    availability: "Official annual transaction totals are available at district level; lower-level estimates are labelled."
  },
  {
    id: "value",
    number: "03",
    title: "Relative value",
    description: "Compare asking prices with similar local transaction evidence.",
    availability: "Requires current, comparable asking-price listings before value rankings can be published."
  },
  {
    id: "development",
    number: "04",
    title: "Development outlook",
    description: "Review infrastructure, accessibility and documented projects.",
    availability: "Project status and distance must be checked for each location."
  },
  {
    id: "nature",
    number: "05",
    title: "Natural characteristics",
    description: "Explore lakes, terrain, wetlands and other location features.",
    availability: "Geographic layers can be inspected on the map; parcel-level environmental checks remain necessary."
  }
];

function normalize(value: string | null | undefined): string {
  return (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-RW", { maximumFractionDigits: 0 }).format(value);
}

function formatPrice(value: number): string {
  return "RWF " + formatNumber(value);
}

function areaHierarchy(area: AreaSearchResult): string {
  return [area.district, area.sector, area.cell, area.village]
    .filter((value): value is string => Boolean(value))
    .filter((value, index, values) => index === 0 || normalize(value) !== normalize(values[index - 1]))
    .join(" · ");
}

function areaRoute(area: AreaSearchResult): string {
  const names = area.level === "district"
    ? [area.district || area.name]
    : area.level === "sector"
      ? [area.district, area.sector || area.name]
      : area.level === "cell"
        ? [area.district, area.sector ?? "", area.cell || area.name]
        : [area.district, area.sector ?? "", area.cell ?? "", area.village || area.name];
  return "/explorer/" + area.level + "/" + names.map((part) => encodeURIComponent(part)).join("/");
}

function mapSearchQuery(area: AreaSearchResult): string {
  if (area.level === "village") return areaHierarchy(area).replaceAll(" · ", ", ");
  return area.name;
}

function districtBenchmark(district: string): DistrictLandPriceBenchmark | null {
  return DISTRICT_LAND_PRICE_BENCHMARKS[normalize(district)] ?? null;
}

function levelLabel(level: AreaLevel | "parcel"): string {
  return level.charAt(0).toUpperCase() + level.slice(1);
}

function resolveAreaMatch(areas: AreaSearchResult[], level: AreaLevel, parts: string[]): AreaSearchResult | null {
  const [district, sector, cell, village] = parts;
  return areas.find((area) => {
    if (area.level !== level) return false;
    const expectedName = parts.at(-1);
    if (normalize(area.name) !== normalize(expectedName)) return false;
    if (district && normalize(area.district) !== normalize(district)) return false;
    if (sector && normalize(area.sector) !== normalize(sector)) return false;
    if (cell && normalize(area.cell) !== normalize(cell)) return false;
    if (village && normalize(area.village) !== normalize(village)) return false;
    return true;
  }) ?? null;
}

export function ExplorerExperience({ initialAreaPath = [] }: { initialAreaPath?: string[] }) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<AreaSearchResult[]>([]);
  const [searchStatus, setSearchStatus] = useState<SearchStatus>("idle");
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeSignal, setActiveSignal] = useState<MarketSignal>("appreciation");
  const [selectedArea, setSelectedArea] = useState<AreaSearchResult | null>(null);
  const [profileStatus, setProfileStatus] = useState<ProfileStatus>(initialAreaPath.length ? "loading" : "idle");
  const [transactionEstimate, setTransactionEstimate] = useState<TransactionEstimate | null>(null);
  const [geometry, setGeometry] = useState<GeometryResponse | null>(null);
  const [transactionStatus, setTransactionStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [geometryStatus, setGeometryStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [mapInstance, setMapInstance] = useState<MapLibreMapInstance | null>(null);
  const [basemapMode, setBasemapMode] = useState<BasemapMode>("map");
  const [mapStatus, setMapStatus] = useState<BasemapStatus>("loading");
  const [boundaryStatus, setBoundaryStatus] = useState<BoundaryStatus>("loading");
  const [mapLayers, setMapLayers] = useState<MapOverlayCategory[]>(["landmarks", "healthEducation", "transportation", "nature"]);
  const [showZoning, setShowZoning] = useState(false);

  const pathKey = initialAreaPath.join("|");
  const isProfileRoute = initialAreaPath.length > 0;
  const activeSignalDetails = useMemo(
    () => SIGNALS.find((signal) => signal.id === activeSignal) ?? SIGNALS[0],
    [activeSignal]
  );

  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length < 2) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearchStatus("loading");
      try {
        const response = await fetch(
          "/api/geography/areas/search?q=" + encodeURIComponent(query),
          { signal: controller.signal }
        );
        if (!response.ok) throw new Error("Area search failed (" + response.status + ")");
        const payload = await response.json() as AreaSearchResponse;
        if (controller.signal.aborted) return;
        setSearchResults((payload.areas ?? []).filter((area) => area.level !== "parcel").slice(0, 10));
        setSearchStatus("ready");
      } catch {
        if (controller.signal.aborted) return;
        setSearchResults([]);
        setSearchStatus("error");
      }
    }, 220);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery]);

  useEffect(() => {
    if (!pathKey) return;

    const [rawLevel, ...parts] = pathKey.split("|");
    if (!["district", "sector", "cell", "village"].includes(rawLevel) || parts.length === 0) {
      const timer = window.setTimeout(() => setProfileStatus("not-found"), 0);
      return () => window.clearTimeout(timer);
    }

    const level = rawLevel as AreaLevel;
    const controller = new AbortController();
    let active = true;

    const loadArea = async () => {
      setProfileStatus("loading");
      setSelectedArea(null);
      setTransactionEstimate(null);
      setGeometry(null);

      try {
        const lastPart = parts.at(-1) ?? "";
        const response = await fetch(
          "/api/geography/areas/search?q=" + encodeURIComponent(lastPart),
          { signal: controller.signal }
        );
        if (!response.ok) throw new Error("Area lookup failed (" + response.status + ")");
        let payload = await response.json() as AreaSearchResponse;
        let area = resolveAreaMatch(payload.areas ?? [], level, parts);

        if (!area && level === "village" && parts.length === 4) {
          const hierarchyResponse = await fetch(
            "/api/geography/areas/search?q=" + encodeURIComponent(parts.join(", ")),
            { signal: controller.signal }
          );
          if (hierarchyResponse.ok) {
            payload = await hierarchyResponse.json() as AreaSearchResponse;
            area = resolveAreaMatch(payload.areas ?? [], level, parts);
          }
        }

        if (!active) return;
        if (!area) {
          setProfileStatus("not-found");
          return;
        }
        setSelectedArea(area);
        setProfileStatus("ready");
      } catch {
        if (!active) return;
        setProfileStatus("error");
      }
    };

    void loadArea();
    return () => {
      active = false;
      controller.abort();
    };
  }, [pathKey]);

  useEffect(() => {
    if (!selectedArea) return;
    const controller = new AbortController();
    const area = selectedArea;
    const transactionParams = new URLSearchParams({
      district: area.district,
      level: area.level
    });
    if (area.sector) transactionParams.set("sector", area.sector);
    if (area.cell) transactionParams.set("cell", area.cell);
    if (area.village) transactionParams.set("village", area.village);

    const loadAreaContext = async () => {
      setTransactionStatus("loading");
      setGeometryStatus(area.mapSourceId ? "loading" : "idle");

      const requests: Array<Promise<void>> = [
      fetch("/api/geography/transaction-estimate?" + transactionParams.toString(), {
        signal: controller.signal
      }).then(async (response) => {
        if (!response.ok) throw new Error("Transaction context is unavailable");
        const payload = await response.json() as TransactionEstimate;
        if (!controller.signal.aborted) {
          setTransactionEstimate(payload);
          setTransactionStatus("ready");
        }
      }).catch(() => {
        if (!controller.signal.aborted) setTransactionStatus("error");
      })
    ];

    if (area.mapSourceId) {
      const geometryParams = new URLSearchParams({
        resolveGeometry: "1",
        source: area.mapSourceId,
        level: area.level,
        name: area.name,
        district: area.district
      });
      if (area.districtId) geometryParams.set("districtId", area.districtId);
      if (area.sector) geometryParams.set("sector", area.sector);
      if (area.sectorId) geometryParams.set("sectorId", area.sectorId);
      if (area.cell) geometryParams.set("cell", area.cell);
      if (area.cellId) geometryParams.set("cellId", area.cellId);
      if (area.village) geometryParams.set("village", area.village);
      if (area.villageId) geometryParams.set("villageId", area.villageId);

      requests.push(
        fetch("/api/geography/areas/search?" + geometryParams.toString(), {
          signal: controller.signal
        }).then(async (response) => {
          if (!response.ok) throw new Error("Boundary geometry is unavailable");
          const payload = await response.json() as GeometryResponse;
          if (!controller.signal.aborted) {
            setGeometry(payload);
            setGeometryStatus(payload.bounds ? "ready" : "error");
          }
        }).catch(() => {
          if (!controller.signal.aborted) setGeometryStatus("error");
        })
      );
    }

      await Promise.all(requests);
    };

    void loadAreaContext();
    return () => controller.abort();
  }, [selectedArea]);


  useEffect(() => {
    if (!mapInstance || !geometry?.bounds || !selectedArea) return;
    const [west, south, east, north] = geometry.bounds;
    mapInstance.fitBounds([[west, south], [east, north]], {
      padding: 42,
      maxZoom: selectedArea.level === "district" ? 10.5 : selectedArea.level === "sector" ? 12.5 : selectedArea.level === "cell" ? 14 : 15.5,
      duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 550
    });
  }, [mapInstance, geometry, selectedArea]);

  const handleMapReady = useCallback((map: MapLibreMapInstance | null) => {
    setMapInstance(map);
  }, []);
  const handleMapStatus = useCallback((status: BasemapStatus) => {
    setMapStatus(status);
  }, []);
  const handleBoundaryStatus = useCallback((status: BoundaryStatus) => {
    setBoundaryStatus(status);
  }, []);
  const handleMapAreaSelected = useCallback((area: SelectedArea | null) => {
    if (!area) return;
    const query = area.level === "parcel"
      ? area.upi ?? area.parcelNumber ?? area.name
      : area.level === "village"
        ? [area.district, area.sector, area.cell, area.village].filter(Boolean).join(", ")
        : area.name;
    router.push("/?areaSearch=" + encodeURIComponent(query));
  }, [router]);
  const toggleMapLayer = (layer: MapOverlayCategory) => {
    setMapLayers((current) => current.includes(layer)
      ? current.filter((item) => item !== layer)
      : [...current, layer]);
  };

  const selectArea = (area: AreaSearchResult) => {
    setSearchOpen(false);
    setSearchQuery("");
    setSearchResults([]);
    router.push(areaRoute(area));
  };

  const openMapHref = selectedArea
    ? "/?areaSearch=" + encodeURIComponent(mapSearchQuery(selectedArea))
    : "/";

  const benchmark = selectedArea ? districtBenchmark(selectedArea.district) : null;
  const districtTransactions = selectedArea
    ? TRANSACTION_DISTRICT_BENCHMARKS[normalize(selectedArea.district)]
    : null;
  const isSubdistrictEstimate = Boolean(
    transactionEstimate?.status === "parcel-share-model" &&
    selectedArea &&
    selectedArea.level !== "district"
  );

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label="Taiseel home">
          <span className={styles.brandMark}>T</span>
          <span className={styles.brandCopy}>
            <strong>TAISEEL</strong>
            <small>LAND INTELLIGENCE · RWANDA</small>
          </span>
        </Link>
        <nav className={styles.navigation} aria-label="Primary navigation">
          <Link href="/">Map</Link>
          <Link href="/explorer" aria-current={!isProfileRoute ? "page" : undefined}>Explorer</Link>
          <Link href="/projects">Projects</Link>
          <Link href="/developers">Developers & agents</Link>
          <Link href="/data-sources">Data sources</Link>
        </nav>
      </header>

      <div className={styles.content}>
        {!isProfileRoute ? (
          <>
            <section className={styles.hero}>
              <p className={styles.eyebrow}>RWANDA · LAND MARKET INTELLIGENCE</p>
              <h1>Market Explorer</h1>
              <p className={styles.heroDescription}>
                Explore land prices, recorded transactions, mapped areas and development context.
                Search any supported district, sector, cell or village.
              </p>
              <div className={styles.searchWrap}>
                <label className={styles.searchLabel} htmlFor="market-area-search">Find an area</label>
                <div className={styles.searchControl}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="10.8" cy="10.8" r="6.8" />
                    <path d="m16 16 5 5" />
                  </svg>
                  <input
                    id="market-area-search"
                    type="search"
                    value={searchQuery}
                    placeholder="Search district, sector, cell or village"
                    autoComplete="off"
                    aria-expanded={searchOpen && searchQuery.trim().length >= 2}
                    aria-controls="market-area-results"
                    onFocus={() => setSearchOpen(true)}
                    onChange={(event) => {
                      setSearchQuery(event.target.value);
                      setSearchOpen(true);
                      if (event.target.value.trim().length < 2) {
                        setSearchResults([]);
                        setSearchStatus("idle");
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") setSearchOpen(false);
                      if (event.key === "Enter" && searchResults[0]) {
                        event.preventDefault();
                        selectArea(searchResults[0]);
                      }
                    }}
                  />
                  {searchQuery ? (
                    <button
                      type="button"
                      className={styles.clearSearch}
                      aria-label="Clear area search"
                      onClick={() => {
                        setSearchQuery("");
                        setSearchResults([]);
                        setSearchOpen(false);
                      }}
                    >×</button>
                  ) : null}
                </div>
                {searchOpen && searchQuery.trim().length >= 2 ? (
                  <div className={styles.searchResults} id="market-area-results" role="listbox">
                    {searchStatus === "loading" ? (
                      <p className={styles.searchMessage}>Searching mapped areas…</p>
                    ) : searchStatus === "error" ? (
                      <p className={styles.searchMessage}>Area search is temporarily unavailable.</p>
                    ) : searchResults.length ? searchResults.map((area) => (
                      <button
                        type="button"
                        role="option"
                        aria-selected={false}
                        className={styles.searchResult}
                        key={area.id}
                        onClick={() => selectArea(area)}
                      >
                        <span>
                          <strong>{area.name}</strong>
                          <small>{areaHierarchy(area)}</small>
                        </span>
                        <span className={styles.resultLevel}>{levelLabel(area.level as AreaLevel)}</span>
                      </button>
                    )) : searchStatus === "ready" ? (
                      <p className={styles.searchMessage}>No matching mapped administrative area was found in the current pilot coverage.</p>
                    ) : (
                      <p className={styles.searchMessage}>Enter at least two characters.</p>
                    )}
                  </div>
                ) : null}
              </div>
              <div className={styles.heroFootnote}>
                <span>Current mapped pilot: Gasabo, Kicukiro, Nyarugenge and Bugesera.</span>
                <Link href="/data-sources">View coverage and sources</Link>
              </div>
            </section>

            <section className={styles.signalsSection} aria-labelledby="signals-title">
              <div className={styles.sectionHeading}>
                <div>
                  <p className={styles.eyebrow}>MARKET SIGNALS</p>
                  <h2 id="signals-title">Explore by what the market is showing</h2>
                </div>
                <p>Choose a signal to see what Taiseel can measure today and what evidence is still needed.</p>
              </div>
              <div className={styles.signalGrid}>
                {SIGNALS.map((signal) => (
                  <button
                    key={signal.id}
                    type="button"
                    aria-pressed={activeSignal === signal.id}
                    className={activeSignal === signal.id ? styles.signalCardActive : styles.signalCard}
                    onClick={() => setActiveSignal(signal.id)}
                  >
                    <span className={styles.signalNumber}>{signal.number}</span>
                    <strong>{signal.title}</strong>
                    <span>{signal.description}</span>
                  </button>
                ))}
              </div>
              <div className={styles.signalDetail} aria-live="polite">
                <strong>{activeSignalDetails.title}</strong>
                <p>{activeSignalDetails.availability}</p>
              </div>
            </section>

            <section className={styles.benchmarkSection} aria-labelledby="benchmark-title">
              <div className={styles.sectionHeading}>
                <div>
                  <p className={styles.eyebrow}>PILOT MARKET SNAPSHOT</p>
                  <h2 id="benchmark-title">District transaction-price benchmarks</h2>
                </div>
                <p>Published dashboard comparison values. These are district benchmarks, not current asking prices or parcel valuations.</p>
              </div>
              <div className={styles.districtGrid}>
                {DISTRICTS.map((district) => {
                  const value = districtBenchmark(district);
                  const transactions = TRANSACTION_DISTRICT_BENCHMARKS[normalize(district)];
                  return (
                    <Link
                      key={district}
                      href={areaRoute({
                        id: "district-" + normalize(district),
                        level: "district",
                        name: district,
                        province: value?.province ?? "",
                        district,
                        districtId: null,
                        sector: null,
                        sectorId: null,
                        cell: null,
                        cellId: null,
                        village: null,
                        villageId: null,
                        averageLandPricePerM2: value?.averageTransactionPricePerM2 ?? null,
                        sourceLabel: "Rwanda Land Dashboard /reference",
                        sourceType: "administrative-boundary"
                      })}
                      className={styles.districtCard}
                    >
                      <span className={styles.districtName}>{district}</span>
                      <strong>{value ? formatPrice(value.averageTransactionPricePerM2) : "Not available"}</strong>
                      <span className={styles.cardMetricLabel}>Average transaction price · RWF/m²</span>
                      <span className={styles.districtMeta}>
                        {transactions ? formatNumber(transactions.annualTransactions2023) + " registered transactions in 2023" : "Transaction total unavailable"}
                      </span>
                      <span className={styles.cardLink}>Open area intelligence <span aria-hidden="true">↗</span></span>
                    </Link>
                  );
                })}
              </div>
              <div className={styles.sourceNote}>
                <strong>How to read this snapshot:</strong> the dashboard does not disclose the observation date or weighting method.
                The values were reviewed on 25 October 2026. They are useful as provisional district context, not as a ranking of
                villages or a guarantee of appreciation.
                <div className={styles.sourceLinks}>
                  <a href={LAND_PRICE_BENCHMARK_SOURCE} target="_blank" rel="noreferrer">Rwanda Land Dashboard · transaction-price comparison ↗</a>
                  <a href={TRANSACTION_BENCHMARK_SOURCE} target="_blank" rel="noreferrer">NISR Statistical Yearbook 2025 · Table 5.2 ↗</a>
                </div>
              </div>
            </section>

            <section className={styles.coverageSection} aria-labelledby="coverage-title">
              <div>
                <p className={styles.eyebrow}>EVIDENCE BEFORE RANKING</p>
                <h2 id="coverage-title">No invented “best area” rankings.</h2>
              </div>
              <p>
                Taiseel will rank locations by appreciation, sales activity or relative value only when the source data supports
                a fair comparison at the same geographic level and over the same period. Until then, district benchmarks and
                mapped coverage are shown separately.
              </p>
            </section>
          </>
        ) : (
          <section className={styles.profilePage}>
            {profileStatus === "loading" ? (
              <div className={styles.loadingPanel} role="status">Loading area intelligence…</div>
            ) : profileStatus === "not-found" ? (
              <div className={styles.emptyPanel}>
                <p className={styles.eyebrow}>AREA NOT FOUND</p>
                <h1>This area is not available in the current mapped pilot.</h1>
                <p>Search results are limited to supported administrative boundary sources. Try a different district, sector, cell or village.</p>
                <Link href="/explorer" className={styles.primaryButton}>Back to Market Explorer</Link>
              </div>
            ) : profileStatus === "error" || !selectedArea ? (
              <div className={styles.emptyPanel}>
                <p className={styles.eyebrow}>TEMPORARY SEARCH ISSUE</p>
                <h1>Area intelligence could not be loaded.</h1>
                <p>The administrative source may be temporarily unavailable. Your existing map and parcel tools are still separate.</p>
                <Link href="/explorer" className={styles.primaryButton}>Back to Market Explorer</Link>
              </div>
            ) : (
              <>
                <div className={styles.breadcrumb}>
                  <Link href="/explorer">Market Explorer</Link>
                  <span aria-hidden="true">/</span>
                  <span>{selectedArea.district}</span>
                  {selectedArea.level !== "district" ? <span aria-hidden="true">/</span> : null}
                  {selectedArea.level !== "district" ? <strong>{selectedArea.name}</strong> : null}
                </div>

                <section className={styles.profileHero}>
                  <div>
                    <p className={styles.eyebrow}>{levelLabel(selectedArea.level)} INTELLIGENCE</p>
                    <h1>{selectedArea.name}</h1>
                    <p>{areaHierarchy(selectedArea)} · {selectedArea.province}</p>
                    <span className={styles.sourceTag}>{selectedArea.sourceLabel}</span>
                  </div>
                  <div className={styles.profileActions}>
                    <Link className={styles.primaryButton} href={openMapHref}>Open in map <span aria-hidden="true">↗</span></Link>
                    <Link className={styles.secondaryButton} href="/explorer">All areas</Link>
                  </div>
                </section>

                <section className={styles.marketSection} aria-labelledby="market-performance-title">
                  <div className={styles.sectionHeading}>
                    <div>
                      <p className={styles.eyebrow}>MARKET PERFORMANCE</p>
                      <h2 id="market-performance-title">Price, sales and market movement</h2>
                    </div>
                    <span className={styles.dataStatus}>Source coverage varies by level</span>
                  </div>
                  <div className={styles.metricGrid}>
                    <article className={styles.metricPanel}>
                      <span className={styles.metricLabel}>
                        {selectedArea.level === "district" ? "Average transaction price" : "District transaction-price benchmark"}
                      </span>
                      <strong>{benchmark ? formatPrice(benchmark.averageTransactionPricePerM2) : "Not available"}</strong>
                      <small>
                        {selectedArea.level === "district"
                          ? "District snapshot · RWF per m²"
                          : "District context only · not a village, cell or parcel price"}
                      </small>
                    </article>
                    <article className={styles.metricPanel}>
                      <span className={styles.metricLabel}>Price appreciation</span>
                      <strong>Not available</strong>
                      <small>Historical price series are not connected at this geographic level.</small>
                    </article>
                    <article className={styles.metricPanel}>
                      <span className={styles.metricLabel}>
                        {selectedArea.level === "district" ? "Registered transactions · 2023" : "Indicative local activity"}
                      </span>
                      <strong>
                        {selectedArea.level === "district" && districtTransactions
                          ? formatNumber(districtTransactions.annualTransactions2023)
                          : transactionEstimate?.estimate !== null && transactionEstimate?.estimate !== undefined
                            ? "≈ " + formatNumber(transactionEstimate.estimate) + " / month"
                            : transactionStatus === "loading" ? "Loading…" : "Not available"}
                      </strong>
                      <small>
                        {selectedArea.level === "district"
                          ? "Official NISR annual district total, 2023."
                          : isSubdistrictEstimate
                            ? "Modelled from the district baseline and cadastral parcel-count share. Not an official local sales count."
                            : transactionEstimate?.method ?? "A local transaction figure is not connected."}
                      </small>
                    </article>
                    <article className={styles.metricPanel}>
                      <span className={styles.metricLabel}>Transaction trend</span>
                      <strong>Not available</strong>
                      <small>A comparable historical series is required to determine whether activity is rising or falling.</small>
                    </article>
                  </div>
                  {selectedArea.level === "district" && selectedArea.district.toLowerCase() === "bugesera" ? (
                    <div className={styles.warningNote}>
                      Bugesera&apos;s reported current-month dashboard figure is not shown as a verified sales count. The source snapshot requires reconciliation before it can be used for rankings.
                    </div>
                  ) : null}
                  <div className={styles.methodNote}>
                    {transactionStatus === "loading" ? "Loading transaction methodology…" : transactionEstimate?.method ?? "Transaction methodology is not available for this area."}
                  </div>
                </section>

                <section className={styles.locationSection} aria-labelledby="geography-title">
                  <div className={styles.sectionHeading}>
                    <div>
                      <p className={styles.eyebrow}>GEOGRAPHIC INTELLIGENCE</p>
                      <h2 id="geography-title">Location and land context</h2>
                    </div>
                    <Link href={openMapHref} className={styles.textLink}>Inspect on map ↗</Link>
                  </div>
                  <div className={styles.locationGrid}>
                    <article className={styles.locationPanel}>
                      <div className={styles.mapPanelHeader}>
                        <strong>Mapped area boundary</strong>
                        <span className={geometryStatus === "ready" ? styles.statusGood : styles.statusNeutral}>
                          {geometryStatus === "loading" ? "Resolving…" : geometryStatus === "ready" ? "Geometry resolved" : "Map check required"}
                        </span>
                      </div>
                      <div className={styles.mapControlRow}>
                        <div className={styles.basemapControls} role="group" aria-label="Area map basemap">
                          <button type="button" aria-pressed={basemapMode === "map"} onClick={() => setBasemapMode("map")}>Map</button>
                          <button type="button" aria-pressed={basemapMode === "satellite"} onClick={() => setBasemapMode("satellite")}>Satellite</button>
                          <button type="button" aria-pressed={basemapMode === "hybrid"} onClick={() => setBasemapMode("hybrid")}>Hybrid</button>
                        </div>
                        <span className={styles.mapStatus}>{mapStatus === "ready" ? "Map ready" : mapStatus === "error" ? "Basemap issue" : "Loading map"}</span>
                      </div>
                      <div className={styles.mapCanvas} aria-label={"Live geographic map for " + selectedArea.name}>
                        <MapView
                          basemapMode={basemapMode}
                          showLandPriceHeatmap={false}
                          selectedMetric={"averageLandPricePerM2" as MapMetric}
                          showLayers={mapLayers}
                          showZoning={showZoning}
                          showScope="pilot"
                          onMapReady={handleMapReady}
                          onStatusChange={handleMapStatus}
                          onBoundaryStatusChange={handleBoundaryStatus}
                          onAreaSelected={handleMapAreaSelected}
                          selectedArea={selectedArea as SelectedArea}
                        />
                      </div>
                      <div className={styles.mapLayerControls}>
                        <button type="button" aria-pressed={mapLayers.includes("transportation")} onClick={() => toggleMapLayer("transportation")}>Roads & transport</button>
                        <button type="button" aria-pressed={mapLayers.includes("nature")} onClick={() => toggleMapLayer("nature")}>Nature</button>
                        <button type="button" aria-pressed={showZoning} onClick={() => setShowZoning((value) => !value)}>Zoning</button>
                      </div>
                      <p className={styles.mapCaption}>
                        Boundary loading status: {boundaryStatus}. Parcel outlines appear at parcel zoom where the connected source provides them.
                      </p>
                      <Link href={openMapHref} className={styles.secondaryButton}>Open full map workspace <span aria-hidden="true">↗</span></Link>
                    </article>
                    <article className={styles.locationPanel}>
                      <strong>Administrative location</strong>
                      <dl className={styles.detailList}>
                        <div><dt>Province</dt><dd>{selectedArea.province || "Not supplied"}</dd></div>
                        <div><dt>District</dt><dd>{selectedArea.district}</dd></div>
                        {selectedArea.sector ? <div><dt>Sector</dt><dd>{selectedArea.sector}</dd></div> : null}
                        {selectedArea.cell ? <div><dt>Cell</dt><dd>{selectedArea.cell}</dd></div> : null}
                        {selectedArea.village ? <div><dt>Village</dt><dd>{selectedArea.village}</dd></div> : null}
                        {geometry?.center ? <div><dt>Centre · longitude / latitude</dt><dd>{geometry.center[0].toFixed(5)}, {geometry.center[1].toFixed(5)}</dd></div> : null}
                      </dl>
                      {geometry?.bounds ? (
                        <p className={styles.smallNote}>Boundary extent resolved from the connected administrative GIS source.</p>
                      ) : (
                        <p className={styles.smallNote}>The selected area is returned by the administrative search source. Exact map geometry can be checked in the live map workspace.</p>
                      )}
                    </article>
                  </div>
                </section>

                <section className={styles.contextSection} aria-labelledby="context-title">
                  <div className={styles.sectionHeading}>
                    <div>
                      <p className={styles.eyebrow}>INFRASTRUCTURE, NATURE AND PLANNING</p>
                      <h2 id="context-title">What surrounds this area</h2>
                    </div>
                    <span className={styles.dataStatus}>Inspect geographic layers on the map</span>
                  </div>
                  <div className={styles.contextGrid}>
                    <article>
                      <span className={styles.contextIcon}>01</span>
                      <h3>Roads and accessibility</h3>
                      <p>Inspect mapped road classes, nearby facilities and available route estimates. Straight-line distance and road travel time are not the same measurement.</p>
                    </article>
                    <article>
                      <span className={styles.contextIcon}>02</span>
                      <h3>Natural features</h3>
                      <p>Inspect lakes, rivers, terrain, wetlands and protected areas. Proximity to water does not mean that construction or waterfront access is permitted.</p>
                    </article>
                    <article>
                      <span className={styles.contextIcon}>03</span>
                      <h3>Zoning and development rules</h3>
                      <p>Check the applicable planning layer, plot-size conditions and restrictions before assuming what can be built.</p>
                    </article>
                  </div>
                  <p className={styles.warningNote}>
                    This profile does not infer development feasibility from an area name. Parcel-specific zoning, environmental rules and current approval conditions must be checked against the relevant official sources.
                  </p>
                </section>

                <section className={styles.inventorySection} aria-labelledby="inventory-title">
                  <div className={styles.sectionHeading}>
                    <div>
                      <p className={styles.eyebrow}>LAND AND PROPERTY INVENTORY</p>
                      <h2 id="inventory-title">Mapped parcels and available listings</h2>
                    </div>
                    <Link href={openMapHref} className={styles.textLink}>Open parcel map ↗</Link>
                  </div>
                  <div className={styles.inventoryMessage}>
                    <strong>No verified public listing feed is connected to this area profile yet.</strong>
                    <p>Mapped cadastral parcels may be available in the live map, but a mapped parcel is not proof that the land is for sale or that the person advertising it owns it.</p>
                  </div>
                </section>

                <section className={styles.provenanceSection} aria-labelledby="provenance-title">
                  <p className={styles.eyebrow}>DATA PROVENANCE</p>
                  <h2 id="provenance-title">Sources and confidence</h2>
                  <div className={styles.provenanceGrid}>
                    <div><strong>Administrative boundary</strong><span>{selectedArea.sourceLabel}</span></div>
                    <div><strong>District price benchmark</strong><span>{benchmark ? "Rwanda Land Dashboard /reference · reviewed " + benchmark.reviewedOn : "No district benchmark found"}</span></div>
                    <div><strong>Transaction benchmark</strong><span>{TRANSACTION_BENCHMARK_SOURCE}</span></div>
                    <div><strong>Observation dates</strong><span>{benchmark?.observationDate ?? "Not disclosed"} · local time series not connected</span></div>
                  </div>
                  <p className={styles.smallNote}>
                    Administrative geometry, cadastral identification, market benchmarks and ownership evidence are different records.
                    This page is not a title search, ownership certificate, valuation or planning approval.
                  </p>
                </section>
              </>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
