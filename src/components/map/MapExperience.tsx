"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { gsap } from "gsap";
import { Marker, type Map as MapLibreMapInstance } from "maplibre-gl";
import { TalkToExpert } from "@/components/map/TalkToExpert";
import {
  MapView,
  isParcelPriceType,
  parcelPriceTypeLabel,
  type BasemapStatus,
  type BoundaryStatus,
  type BasemapMode,
  type MapOverlayCategory,
  type MapMetric,
  type ParcelPriceType,
  type SelectedArea
} from "@/components/map/MapView";
import { RWANDA_DEVELOPER_CANDIDATES } from "@/data/developer-directory";
import {
  DISTRICT_LAND_PRICE_BENCHMARKS,
  getDistrictLandPriceBenchmark,
  LAND_PRICE_BENCHMARK_SOURCE,
  LAND_PRICE_PRICES_CROSSCHECK_SOURCE
} from "@/data/land-price-benchmarks";
import {
  RWANDA_PUBLIC_AGENT_CANDIDATES,
  RWANDA_REAL_ESTATE_AGENCIES
} from "@/data/real-estate-directory";
import {
  TRANSACTION_BENCHMARK_SOURCE,
  TRANSACTION_DASHBOARD_SOURCE
} from "@/data/transaction-benchmarks";
import { calculateParcelAskingPrice } from "@/lib/parcel-pricing";

type WorkspaceMode = "areas" | "projects";

function zoningEntryLabel(zone: NonNullable<SelectedArea["zoning"]>[number]): string {
  const code = zone.code?.trim();
  const name = zone.name.trim();
  return code && !name.toLowerCase().startsWith(code.toLowerCase())
    ? code + " — " + name
    : name;
}

type PropertyScope = "all" | "land" | "apartment" | "villa";
type AnalysisPeriod = "3m" | "6m" | "12m";
type DirectoryTab = "developers" | "agencies" | "agents";

type LandPriceRow = {
  sourceLine: number;
  province: string | null;
  district: string | null;
  sector: string | null;
  cell: string | null;
  price: number | null;
  valid: boolean;
};

type LandPriceLookup = {
  status: "found" | "ambiguous" | "unavailable" | "sector-summary-not-provided";
  price: number | null;
  sourceLines: number[];
  pricedCells: number;
};

type CellParcelRecord = {
  id: string;
  upi: string;
  parcelNumber: string | null;
  district: string;
  sector: string;
  cell: string;
  village: string | null;
  areaM2: number | null;
  wetlandAreaM2: number | null;
  lastUpdatedOn: number | null;
  bounds: [number, number, number, number];
};

type CellParcelResponse = {
  totalSourceRecords: number;
  returnedRecords: number;
  capped: boolean;
  parcels: CellParcelRecord[];
};

type ComparisonItem = SelectedArea & {
  comparisonKind?: "area" | "project";
  projectSourceUrl?: string | null;
  transactionEstimate?: TransactionEstimateResponse | null;
  comparisonZoningStatus?: "loading" | "found" | "not-covered" | "error";
  comparisonZoning?: Array<{ code: string | null; name: string }>;
};
type AreaSearchResult = SelectedArea & { id: string };
type AddressSearchResult = {
  id: string;
  kind: "address";
  name: string;
  displayName: string;
  latitude: number;
  longitude: number;
  sourceLabel: string;
};
type GlobalSearchResult = AreaSearchResult | AddressSearchResult;
type AreaSearchResponse = {
  areas: AreaSearchResult[];
  addresses?: AddressSearchResult[];
  message?: string;
  error?: string;
  browse?: boolean;
  nextOffset?: number;
  hasMore?: boolean;
};
type ComparisonZoningResponse = { status?: "found" | "not-covered"; zones?: Array<{ code: string | null; name: string }>; error?: string };
type NearbyAccessCategory = "School" | "Clinic / hospital" | "Public transport";
type NearbyAccessItem = {
  id: string;
  category: NearbyAccessCategory;
  name: string;
  distanceKm: number | null;
  timeMinutes: number | null;
  routeStatus: "routed" | "unavailable";
};
type NearbyAccessResponse = {
  status: "ready" | "error";
  items: NearbyAccessItem[];
  source: string;
  note: string;
  message?: string;
};
type NearbyAccessState = NearbyAccessResponse | { status: "loading"; items: []; source: string; note: string } | null;
type TransactionEstimateResponse = {
  estimate: number | null;
  status: "reported-current-month-unverified" | "historical-monthly-baseline" | "parcel-share-model" | "unavailable";
  method: string;
  unit?: string;
  annualTransactions2023?: number;
  currentMonthReported?: { count: number; observedOn: string; status: string; note: string } | null;
  allocation?: { districtParcelCount: number; areaParcelCount: number; estimatedShare: number; method: string };
};

type UnitPriceEstimate = {
  pricePerM2: number | null;
  kind: "cell-transaction-price-snapshot" | "derived-sector-mean" | "district-transaction-price-snapshot" | "unavailable" | "conflicting";
  explanation: string;
};

const DISTRICT_PRICE_SNAPSHOTS: Record<string, number> = Object.fromEntries(
  Object.entries(DISTRICT_LAND_PRICE_BENCHMARKS).map(([key, benchmark]) => [
    key,
    benchmark.averageTransactionPricePerM2
  ])
) as Record<string, number>;

function getUnitPriceEstimate(
  rows: LandPriceRow[],
  area: SelectedArea,
  allowDistrictFallback = false
): UnitPriceEstimate {
  const districtKey = normalizeAreaName(area.district);
  // uses the currently connected district transaction-price snapshot where finer-level data is missing.
  // Keep this as a fallback only: a parcel-specific asking price needs a named source.
  if (area.level === "district" && area.averageLandPricePerM2 !== null) {
    return {
      pricePerM2: area.averageLandPricePerM2,
      kind: "district-transaction-price-snapshot",
      explanation: "Dashboard average transaction price snapshot; source observation date and weighting method are not disclosed."
    };
  }
  if (area.level === "sector" && area.averageLandPricePerM2 !== null) {
    return {
      pricePerM2: area.averageLandPricePerM2,
      kind: "derived-sector-mean",
      explanation: "Indicative sector figure derived from available cell-level transaction-price snapshots; not an official sector-weighted transaction price."
    };
  }

  if (area.level === "cell" && area.averageLandPricePerM2 !== null) {
    return {
      pricePerM2: area.averageLandPricePerM2,
      kind: "cell-transaction-price-snapshot",
      explanation: "Cell-level weighted-average transaction-price snapshot; source observation date and calculation method have not been confirmed."
    };
  }

  if (area.level === "sector") {
    const byCell = new Map<string, Set<number>>();
    for (const row of rows) {
      if (!row.valid ||
        normalizeAreaName(row.district) !== districtKey ||
        normalizeAreaName(row.sector) !== normalizeAreaName(area.name) ||
        row.price === null) continue;
      const key = normalizeAreaName(row.cell);
      const prices = byCell.get(key) ?? new Set<number>();
      prices.add(row.price);
      byCell.set(key, prices);
    }
    const uniqueCellPrices = Array.from(byCell.values())
      .filter((prices) => prices.size === 1)
      .map((prices) => prices.values().next().value as number);
    if (uniqueCellPrices.length > 0) {
      return {
        pricePerM2: uniqueCellPrices.reduce((sum, price) => sum + price, 0) / uniqueCellPrices.length,
        kind: "derived-sector-mean",
        explanation: "Indicative unweighted mean of unambiguous cell transaction-price snapshots. Conflicting cells are excluded; this is not an official sector-weighted transaction price."
      };
    }
  }

  const targetCell = area.level === "cell"
    ? area.name
    : area.level === "village" || area.level === "parcel"
      ? area.cell
      : null;
  if (targetCell && area.sector) {
    const matches = rows.filter((row) =>
      row.valid &&
      normalizeAreaName(row.district) === districtKey &&
      normalizeAreaName(row.sector) === normalizeAreaName(area.sector) &&
      normalizeAreaName(row.cell) === normalizeAreaName(targetCell)
    );
    const uniquePrices = new Set(matches.map((row) => row.price).filter((price): price is number => price !== null));
    if (uniquePrices.size === 1) {
      return {
        pricePerM2: uniquePrices.values().next().value ?? null,
        kind: "cell-transaction-price-snapshot",
        explanation: "Exact cell-level weighted-average transaction-price snapshot; source date and calculation method have not been confirmed."
      };
    }
    if (uniquePrices.size > 1) {
      if (!allowDistrictFallback) {
        return { pricePerM2: null, kind: "conflicting", explanation: "The cell transaction-price snapshot contains conflicting values." };
      }
    }
  }

  if (allowDistrictFallback && area.level === "parcel" && area.sector) {
    const byCell = new Map<string, Set<number>>();
    for (const row of rows) {
      if (!row.valid ||
        normalizeAreaName(row.district) !== districtKey ||
        normalizeAreaName(row.sector) !== normalizeAreaName(area.sector) ||
        row.price === null) continue;
      const key = normalizeAreaName(row.cell);
      const prices = byCell.get(key) ?? new Set<number>();
      prices.add(row.price);
      byCell.set(key, prices);
    }
    const uniqueCellPrices = Array.from(byCell.values())
      .filter((prices) => prices.size === 1)
      .map((prices) => prices.values().next().value as number);
    if (uniqueCellPrices.length > 0) {
      return {
        pricePerM2: uniqueCellPrices.reduce((sum, price) => sum + price, 0) / uniqueCellPrices.length,
        kind: "derived-sector-mean",
        explanation: "Indicative sector mean from available unambiguous cell transaction-price snapshots. Conflicting cells are excluded; this is used as a proxy because no unique cell snapshot was available."
      };
    }
  }

  const districtPrice = DISTRICT_PRICE_SNAPSHOTS[districtKey] ?? null;
  if (allowDistrictFallback && districtPrice !== null) {
    return {
      pricePerM2: districtPrice,
      kind: "district-transaction-price-snapshot",
      explanation: "No unique cell reference was available, so the district dashboard snapshot is used as a clearly labelled rough fallback."
    };
  }
  return { pricePerM2: null, kind: "unavailable", explanation: "No defensible unit price is available at this geographic level." };
}

function comparisonItemKey(area: ComparisonItem): string {
  return [
    area.comparisonKind ?? "area",
    area.level,
    normalizeAreaName(area.district),
    normalizeAreaName(area.sector),
    normalizeAreaName(area.cell),
    normalizeAreaName(area.village),
    normalizeAreaName(area.upi),
    normalizeAreaName(area.parcelNumber),
    normalizeAreaName(area.name),
    normalizeAreaName(area.projectSourceUrl)
  ].join("|");
}

function areaLevelLabel(level: SelectedArea["level"]): string {
  return level.charAt(0).toUpperCase() + level.slice(1);
}

function transactionEstimateKeyForArea(area: SelectedArea): string {
  return [area.level, area.district, area.sector ?? "", area.cell ?? "", area.village ?? "", area.name].join("|");
}

function normalizeAreaName(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en");
}

function parseLandPriceTransactionPrices(text: string): LandPriceRow[] {
  return text
    .split(/\r?\n/)
    .slice(1)
    .filter((line) => line.trim().length > 0)
    .map((line, index) => {
      const fields = line.split("\t");
      const rawPrice = fields.length === 5 ? Number(fields[4].replace(/,/g, "").trim()) : Number.NaN;
      const valid =
        fields.length === 5 &&
        fields.slice(0, 4).every((field) => field.trim().length > 0) &&
        Number.isFinite(rawPrice) &&
        rawPrice > 0;

      return {
        sourceLine: index + 2,
        province: fields[0]?.trim() || null,
        district: fields.length === 5 ? fields[1].trim() : null,
        sector: fields.length === 5 ? fields[2].trim() : null,
        cell: fields.length === 5 ? fields[3].trim() : null,
        price: valid ? rawPrice : null,
        valid
      };
    });
}

function lookupLandPriceForArea(
  rows: LandPriceRow[],
  area: SelectedArea
): LandPriceLookup {
  if (area.level === "sector") {
    const sectorRows = rows.filter(
      (row) =>
        row.valid &&
        normalizeAreaName(row.district) === normalizeAreaName(area.district) &&
        normalizeAreaName(row.sector) === normalizeAreaName(area.name)
    );
    const byCell = new Map<string, Set<number>>();
    for (const row of sectorRows) {
      const key = normalizeAreaName(row.cell);
      const prices = byCell.get(key) ?? new Set<number>();
      if (row.price !== null) prices.add(row.price);
      byCell.set(key, prices);
    }
    const pricedCells = Array.from(byCell.values()).filter((prices) => prices.size === 1).length;
    return {
      status: "sector-summary-not-provided",
      price: null,
      sourceLines: [],
      pricedCells
    };
  }

  if (area.level !== "cell" || !area.sector) {
    return { status: "unavailable", price: null, sourceLines: [], pricedCells: 0 };
  }

  const matches = rows.filter(
    (row) =>
      row.valid &&
      normalizeAreaName(row.district) === normalizeAreaName(area.district) &&
      normalizeAreaName(row.sector) === normalizeAreaName(area.sector) &&
      normalizeAreaName(row.cell) === normalizeAreaName(area.name)
  );

  if (matches.length === 0) {
    return { status: "unavailable", price: null, sourceLines: [], pricedCells: 0 };
  }

  const prices = new Set(matches.map((row) => row.price).filter((price): price is number => price !== null));
  const sourceLines = matches.map((row) => row.sourceLine);
  if (prices.size !== 1) {
    return { status: "ambiguous", price: null, sourceLines, pricedCells: 0 };
  }

  return {
    status: "found",
    price: prices.values().next().value ?? null,
    sourceLines,
    pricedCells: 1
  };
}

function getLandPriceDiagnostics(rows: LandPriceRow[]) {
  const validRows = rows.filter((row) => row.valid);
  const pricesByLocation = new Map<string, Set<number>>();
  for (const row of validRows) {
    const key = [
      normalizeAreaName(row.district),
      normalizeAreaName(row.sector),
      normalizeAreaName(row.cell)
    ].join("|");
    const prices = pricesByLocation.get(key) ?? new Set<number>();
    if (row.price !== null) prices.add(row.price);
    pricesByLocation.set(key, prices);
  }
  return {
    usableRows: validRows.length,
    malformedRows: rows.length - validRows.length,
    conflictingLocations: Array.from(pricesByLocation.values()).filter((prices) => prices.size > 1).length
  };
}

function initialsForName(name: string): string {
  return name
    .split(/[\s&\/-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}
type MarketMetric = MapMetric;

const MARKET_METRICS: Array<{
  id: MarketMetric;
  label: string;
  shortLabel: string;
  description: string;
  dataStatus: string;
}> = [
  {
    id: "averageLandPricePerM2",
    label: "Average transaction price / m²",
    shortLabel: "Transaction price / m²",
    description: "Average land transaction price in Rwandan francs per square metre. The average reference price is a separate benchmark and is not used for the primary parcel-value estimate.",
    dataStatus: "The /reference comparison table explicitly lists average transaction prices of Gasabo 36,103, Kicukiro 61,499, Nyarugenge 50,865 and Bugesera 4,038 RWF/m², alongside separate average reference prices of 19,976, 27,914, 28,077 and 1,145 RWF/m². The /prices page lists Nyarugenge at 50,771, leaving a 94 RWF/m² cross-page discrepancy. Source observation date and weighting method are not disclosed. Cell-level weighted averages remain provisional; duplicate geographic keys are withheld rather than silently averaged."
  },
  {
    id: "transactionVolume",
    label: "Transaction volume",
    shortLabel: "Transactions",
    description: "How many registered land transactions take place in an area.",
    dataStatus: "NISR Statistical Yearbook 2025 Table 5.2 supplies annual district transaction totals for 2023. The app divides those totals by 12 for a historical monthly baseline in Gasabo, Kicukiro and Nyarugenge. For Bugesera, 4,350 is a user-reported month-to-date reading observed 24 Oct 2026; an indexed overview separately showed 4,031, so the current figure remains unverified. Sector, cell and village numbers are modelled by their share of returned cadastral parcel records, not official transaction counts. The public Data Sharing Platform lists transaction summaries by district, sector and cell, but approved access is required before integrating that dataset. Transaction volume is activity, not proof of price appreciation."
  },
  {
    id: "capitalAppreciation",
    label: "Capital appreciation",
    shortLabel: "Appreciation",
    description: "How comparable prices changed over a selected period.",
    dataStatus: "The time series is not connected and validated here. The dashboard displays a land-price trend, but comparable dated transaction-price observations are not exposed as a validated area-level time series. Capital appreciation is calculated only when historical and current prices for the same area and metric are available; this snapshot alone is not enough to produce a defensible percentage."
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
  { value: "all", label: "All" },
  { value: "land", label: "Land" },
  { value: "apartment", label: "Apartment" },
  { value: "villa", label: "Villa" }
];

const ANALYSIS_PERIODS: Array<{ value: AnalysisPeriod; label: string; shortLabel: string }> = [
  { value: "12m", label: "1 year", shortLabel: "1Y" },
  { value: "6m", label: "6 months", shortLabel: "6M" },
  { value: "3m", label: "3 months", shortLabel: "3M" }
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
  const analysisPeriod: AnalysisPeriod = "12m";
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [metricsOpen, setMetricsOpen] = useState(false);
  const [developersOpen, setDevelopersOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [showOpen, setShowOpen] = useState(false);
  const [showLayers, setShowLayers] = useState<MapOverlayCategory[]>([]);
  const [showZoning, setShowZoning] = useState(false);
  const [directoryTab, setDirectoryTab] = useState<DirectoryTab>("developers");
  const [directorySearch, setDirectorySearch] = useState("");
  const [globalSearch, setGlobalSearch] = useState("");
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [globalSearchResults, setGlobalSearchResults] = useState<GlobalSearchResult[]>([]);
  const [globalSearchStatus, setGlobalSearchStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [landPriceRows, setLandPriceRows] = useState<LandPriceRow[]>([]);
  const [landPriceLoadStatus, setLandPriceLoadStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [cellParcels, setCellParcels] = useState<CellParcelRecord[]>([]);
  const [cellParcelsLookupKey, setCellParcelsLookupKey] = useState<string | null>(null);
  const [cellParcelsStatus, setCellParcelsStatus] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [cellParcelsTotal, setCellParcelsTotal] = useState(0);
  const [cellParcelsCapped, setCellParcelsCapped] = useState(false);
  const [metricInfoOpen, setMetricInfoOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareSearch, setCompareSearch] = useState("");
  const [compareBrowseOpen, setCompareBrowseOpen] = useState(false);
  const [comparisonBrowseOffset, setComparisonBrowseOffset] = useState(0);
  const [comparisonBrowseHasMore, setComparisonBrowseHasMore] = useState(false);
  const [comparisonSearchResults, setComparisonSearchResults] = useState<AreaSearchResult[]>([]);
  const [comparisonSearchStatus, setComparisonSearchStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [comparedAreas, setComparedAreas] = useState<ComparisonItem[]>([]);
  const [comparisonFeedback, setComparisonFeedback] = useState("");
  const [nearbyAccessSnapshot, setNearbyAccessSnapshot] = useState<{ key: string; value: Exclude<NearbyAccessState, null> } | null>(null);
  const [compareProjectName, setCompareProjectName] = useState("");
  const [compareProjectUrl, setCompareProjectUrl] = useState("");
  const [selectedTransactionEstimate, setSelectedTransactionEstimate] = useState<TransactionEstimateResponse | null>(null);
  const [selectedTransactionEstimateKey, setSelectedTransactionEstimateKey] = useState<string | null>(null);
  const [selectedTransactionEstimateStatus, setSelectedTransactionEstimateStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [mapInstance, setMapInstance] = useState<MapLibreMapInstance | null>(
    null
  );
  const [basemapStatus, setBasemapStatus] =
    useState<BasemapStatus>("loading");
  const [boundaryStatus, setBoundaryStatus] =
    useState<BoundaryStatus>("loading");
  const [selectedArea, setSelectedArea] = useState<SelectedArea | null>(null);
  const globalSearchMarkerRef = useRef<Marker | null>(null);
  const globalSearchSequenceRef = useRef(0);
  const nearbyAreaLevel = selectedArea?.level ?? null;
  const nearbyAreaLongitude = selectedArea?.center?.[0] ?? null;
  const nearbyAreaLatitude = selectedArea?.center?.[1] ?? null;
  const nearbyAreaDistrict = selectedArea?.district ?? null;
  const nearbyAreaUpi = selectedArea?.upi ?? null;
  const nearbyAreaName = selectedArea?.name ?? null;
  const nearbyAccessKey = nearbyAreaLevel === "parcel" &&
    nearbyAreaLongitude !== null &&
    nearbyAreaLatitude !== null
      ? [nearbyAreaUpi ?? nearbyAreaName ?? "", nearbyAreaLongitude, nearbyAreaLatitude, nearbyAreaDistrict ?? ""].join("|")
      : null;
  const nearbyAccess: NearbyAccessState = nearbyAccessKey === null
    ? null
    : nearbyAccessSnapshot?.key === nearbyAccessKey
      ? nearbyAccessSnapshot.value
      : {
          status: "loading",
          items: [],
          source: "Valhalla · OpenStreetMap road graph",
          note: "Estimated road routes; not live traffic."
        };
  const toolbarRef = useRef<HTMLDivElement>(null);
  const areaPanelRef = useRef<HTMLElement>(null);

  const handleMapReady = useCallback(
    (map: MapLibreMapInstance | null) => {
      if (!map) {
        globalSearchMarkerRef.current?.remove();
        globalSearchMarkerRef.current = null;
      }
      setMapInstance(map);
    },
    []
  );
  const handleAreaSelected = useCallback(
    (area: SelectedArea | null) => {
      globalSearchMarkerRef.current?.remove();
      globalSearchMarkerRef.current = null;
      setGlobalSearchOpen(false);
      setSelectedArea(area);
    },
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

  const searchGlobalAddress = async (query: string) => {
    const requestId = ++globalSearchSequenceRef.current;
    if (query.trim().length < 4) {
      setGlobalSearchStatus("ready");
      return;
    }
    setGlobalSearchStatus("loading");
    try {
      const response = await fetch(
        "/api/geography/areas/search?addressOnly=1&q=" + encodeURIComponent(query.trim())
      );
      if (!response.ok) throw new Error("Address search failed (" + response.status + ")");
      const payload = await response.json() as AreaSearchResponse;
      if (requestId !== globalSearchSequenceRef.current) return;
      const addresses = payload.addresses ?? [];
      setGlobalSearchResults((current) => [
        ...current.filter((item) => !("kind" in item && item.kind === "address")),
        ...addresses
      ]);
      setGlobalSearchStatus("ready");
    } catch {
      setGlobalSearchStatus("error");
    }
  };

  const selectGlobalSearchResult = (result: GlobalSearchResult) => {
    setWorkspaceMode("areas");
    setGlobalSearchOpen(false);
    setGlobalSearch("");
    setGlobalSearchResults([]);
    setGlobalSearchStatus("idle");
    setSourcesOpen(false);
    setShowOpen(false);
    setMetricInfoOpen(false);
    setMetricsOpen(false);
    setDevelopersOpen(false);
    setProjectsOpen(false);

    if ("kind" in result && result.kind === "address") {
      setSelectedArea(null);
      if (mapInstance) {
        globalSearchMarkerRef.current?.remove();
        globalSearchMarkerRef.current = new Marker({ color: "#00CFE8", scale: 1.05 })
          .setLngLat([result.longitude, result.latitude])
          .addTo(mapInstance);
        mapInstance.flyTo({
          center: [result.longitude, result.latitude],
          zoom: 17.2,
          duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 650
        });
      }
      return;
    }

    const area = result as AreaSearchResult;
    globalSearchMarkerRef.current?.remove();
    globalSearchMarkerRef.current = null;
    setSelectedArea(area);
    if (!mapInstance) return;

    const mobile = window.matchMedia("(max-width: 720px)").matches;
    const padding = mobile
      ? { top: 168, bottom: 138, left: 20, right: 20 }
      : { top: 126, bottom: 78, left: 340, right: 78 };
    const maxZoom: Record<SelectedArea["level"], number> = {
      district: 11.7,
      sector: 14.8,
      cell: 16,
      village: 16.8,
      parcel: 19.3
    };

    if (area.bounds) {
      const [west, south, east, north] = area.bounds;
      mapInstance.fitBounds([[west, south], [east, north]], {
        padding,
        maxZoom: maxZoom[area.level],
        duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 650
      });
    } else if (area.center) {
      mapInstance.flyTo({
        center: area.center,
        zoom: maxZoom[area.level],
        duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 650
      });
    }
  };

  const fetchTransactionEstimate = async (area: SelectedArea, signal?: AbortSignal): Promise<TransactionEstimateResponse | null> => {
    if (area.level === "parcel") return null;
    const params = new URLSearchParams({ district: area.district, level: area.level });
    if (area.sector) params.set("sector", area.sector);
    if (area.cell) params.set("cell", area.cell);
    if (area.village) params.set("village", area.village);
    try {
      const response = await fetch("/api/geography/transaction-estimate?" + params.toString(), { signal });
      if (!response.ok) throw new Error("Transaction estimate request failed (" + response.status + ")");
      return await response.json() as TransactionEstimateResponse;
    } catch {
      if (signal?.aborted) return null;
      return { estimate: null, status: "unavailable", method: "No usable estimate was returned." };
    }
  };

  const addAreaToComparison = (areaToAdd: SelectedArea) => {
    const item: ComparisonItem = {
      ...areaToAdd, comparisonKind: "area", transactionEstimate: null,
      comparisonZoningStatus: areaToAdd.level === "parcel" ? "loading" : undefined
    };
    const itemKey = comparisonItemKey(item);
    const exists = comparedAreas.some((area) => comparisonItemKey(area) === itemKey);
    if (exists) {
      setComparisonFeedback(areaToAdd.name + " is already on your comparison list.");
      setSourcesOpen(false); setMetricInfoOpen(false); setCompareOpen(true); return;
    }
    setComparedAreas((areas) => [...areas, item]);
    setComparisonFeedback(areaToAdd.name + " added to comparison.");
    setSourcesOpen(false); setMetricInfoOpen(false); setCompareOpen(true);
    if (areaToAdd.level !== "parcel") {
      void fetchTransactionEstimate(areaToAdd).then((estimate) => {
        if (!estimate) return;
        setComparedAreas((areas) => areas.map((area) =>
          comparisonItemKey(area) === itemKey ? { ...area, transactionEstimate: estimate } : area
        ));
      });
    } else if (areaToAdd.upi) {
      const params = new URLSearchParams({ district: areaToAdd.district, upi: areaToAdd.upi });
      void fetch("/api/geography/parcel-zoning?" + params.toString())
        .then(async (response) => {
          const payload = await response.json() as ComparisonZoningResponse;
          if (!response.ok) throw new Error(payload.error ?? "Parcel zoning is unavailable.");
          setComparedAreas((areas) => areas.map((area) => comparisonItemKey(area) === itemKey
            ? { ...area, comparisonZoningStatus: payload.status === "found" ? "found" : "not-covered", comparisonZoning: payload.zones ?? [] }
            : area));
        })
        .catch(() => setComparedAreas((areas) => areas.map((area) => comparisonItemKey(area) === itemKey
          ? { ...area, comparisonZoningStatus: "error", comparisonZoning: [] } : area)));
    } else {
      setComparedAreas((areas) => areas.map((area) => comparisonItemKey(area) === itemKey
        ? { ...area, comparisonZoningStatus: "error", comparisonZoning: [] } : area));
    }
  };

  const addManualProjectToComparison = () => {
    const name = compareProjectName.trim();
    if (!name) { setComparisonFeedback("Enter a project name first."); return; }
    let sourceUrl: string | null = null;
    if (compareProjectUrl.trim()) {
      try {
        const parsed = new URL(compareProjectUrl.trim());
        if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("unsupported protocol");
        sourceUrl = parsed.toString();
      } catch {
        setComparisonFeedback("Use a valid http or https project source URL, or leave it blank.");
        return;
      }
    }
    const item: ComparisonItem = {
      level: "district", name, province: null, district: "Project", districtId: null, sector: null, sectorId: null,
      cell: null, cellId: null, village: null, villageId: null, averageLandPricePerM2: null,
      sourceLabel: "Manually added project. A permitted, verified project data feed is not connected.",
      comparisonKind: "project", projectSourceUrl: sourceUrl, transactionEstimate: null
    };
    const itemKey = comparisonItemKey(item);
    if (comparedAreas.some((area) => comparisonItemKey(area) === itemKey)) {
      setComparisonFeedback(name + " is already on your comparison list.");
      return;
    }
    setComparedAreas((areas) => [...areas, item]);
    setCompareProjectName("");
    setCompareProjectUrl("");
    setComparisonFeedback(name + " added. Project metrics remain blank until a verified source is connected.");
  };

  const addSelectedAreaToComparison = () => {
    if (!selectedArea) return;
    addAreaToComparison(selectedArea);
  };

  const removeComparedArea = (areaToRemove: ComparisonItem) => {
    const removeKey = comparisonItemKey(areaToRemove);
    setComparedAreas((areas) => areas.filter((area) => comparisonItemKey(area) !== removeKey));
    setComparisonFeedback("");
  };

  const activeMetric =
    MARKET_METRICS.find((metric) => metric.id === selectedMetric) ??
    MARKET_METRICS[0];
  const selectedLandPrice = selectedArea
    ? lookupLandPriceForArea(landPriceRows, selectedArea)
    : null;
  const activeCellParcelKey = selectedArea?.level === "cell" && selectedArea.sector
    ? [selectedArea.district, selectedArea.sector, selectedArea.name].join("|")
    : null;
  const activeCellParcelsStatus = activeCellParcelKey && cellParcelsLookupKey === activeCellParcelKey
    ? cellParcelsStatus
    : activeCellParcelKey
      ? "loading"
      : "idle";
  const landPriceDiagnostics = getLandPriceDiagnostics(landPriceRows);
  const normalizedComparisonSearch = compareSearch.trim().toLocaleLowerCase();
  const normalizedDirectorySearch = directorySearch.trim().toLocaleLowerCase();
  const visibleDeveloperCandidates = [
    { id: "taiseel-development", name: "Taiseel Development", logoUrl: undefined },
    ...RWANDA_DEVELOPER_CANDIDATES
  ].filter((candidate) => candidate.name.toLocaleLowerCase().includes(normalizedDirectorySearch));
  const visibleAgencies = [
    { id: "taiseel-resident", name: "Taiseel Resident" },
    ...RWANDA_REAL_ESTATE_AGENCIES
  ].filter((candidate) => candidate.name.toLocaleLowerCase().includes(normalizedDirectorySearch));
  const visibleAgents = [
    { id: "carissa-taiseel", name: "Carissa Taiseel" },
    ...RWANDA_PUBLIC_AGENT_CANDIDATES
  ].filter((candidate) => candidate.name.toLocaleLowerCase().includes(normalizedDirectorySearch));
  const activeTransactionEstimateKey = selectedArea ? transactionEstimateKeyForArea(selectedArea) : null;
  const transactionEstimateForSelected = activeTransactionEstimateKey === selectedTransactionEstimateKey
    ? selectedTransactionEstimate
    : null;
  const comparisonUnitPrices = comparedAreas.map((area) => ({
    area,
    estimate: area.comparisonKind === "project"
      ? { pricePerM2: null, kind: "unavailable" as const, explanation: "Project price data is not connected." }
      : getUnitPriceEstimate(landPriceRows, area)
  }));
  const comparisonPrices = comparisonUnitPrices
    .filter(({ estimate }) => estimate.pricePerM2 !== null)
    .map(({ estimate }) => estimate.pricePerM2 as number);
  const lowestComparisonPrice = comparisonPrices.length > 1 ? Math.min(...comparisonPrices) : null;
  const comparisonParcelAskingPrices = comparedAreas.map((area) => {
    if (area.comparisonKind === "project" || area.level !== "parcel") {
      return { key: comparisonItemKey(area), area, askingPrice: null as number | null };
    }
    const suppliedPrice = isParcelPriceType(area.parcelPriceType) &&
      typeof area.parcelPriceValue === "number" &&
      Number.isFinite(area.parcelPriceValue) &&
      area.parcelPriceValue > 0 &&
      Boolean(area.parcelPriceSource?.trim());
    const unitEstimate = getUnitPriceEstimate(landPriceRows, area, true);
    const askingPrice = suppliedPrice
      ? area.parcelPriceValue!
      : calculateParcelAskingPrice(area.parcelSizeM2, unitEstimate.pricePerM2);
    return { key: comparisonItemKey(area), area, askingPrice };
  });
  const comparableAskingPrices = comparisonParcelAskingPrices
    .map((item) => item.askingPrice)
    .filter((price): price is number => price !== null && Number.isFinite(price) && price > 0);
  const lowestComparisonAskingPrice = comparableAskingPrices.length > 1
    ? Math.min(...comparableAskingPrices)
    : null;
  const comparisonParcelAreas = comparedAreas
    .filter((area) => area.comparisonKind !== "project" && area.level === "parcel" &&
      typeof area.parcelSizeM2 === "number" && Number.isFinite(area.parcelSizeM2) && area.parcelSizeM2 > 0)
    .map((area) => area.parcelSizeM2 as number);
  const largestComparisonParcelArea = comparisonParcelAreas.length > 1 ? Math.max(...comparisonParcelAreas) : null;
  const parcelUnitPriceEstimate = selectedArea?.level === "parcel"
    ? getUnitPriceEstimate(landPriceRows, selectedArea, true)
    : null;
  const calculatedParcelAskingPrice = selectedArea?.level === "parcel"
    ? calculateParcelAskingPrice(selectedArea.parcelSizeM2, parcelUnitPriceEstimate?.pricePerM2)
    : null;
  // Use direct-price records only when a recognized type and named source exist.
  // Otherwise keep the current area-based figure explicitly labelled as an estimate.
  const hasSourcedParcelPrice = selectedArea?.level === "parcel" &&
    isParcelPriceType(selectedArea.parcelPriceType) &&
    typeof selectedArea.parcelPriceValue === "number" &&
    Number.isFinite(selectedArea.parcelPriceValue) &&
    selectedArea.parcelPriceValue > 0 &&
    typeof selectedArea.parcelPriceSource === "string" &&
    selectedArea.parcelPriceSource.trim().length > 0;
  const hasParcelAskingPrice = calculatedParcelAskingPrice !== null;
  const hasParcelUnitPriceOnly = selectedArea?.level === "parcel" &&
    !hasParcelAskingPrice &&
    parcelUnitPriceEstimate?.pricePerM2 !== null &&
    parcelUnitPriceEstimate?.pricePerM2 !== undefined;
  const displayedParcelValue = hasSourcedParcelPrice
    ? selectedArea?.parcelPriceValue ?? null
    : calculatedParcelAskingPrice ?? (hasParcelUnitPriceOnly ? parcelUnitPriceEstimate?.pricePerM2 ?? null : null);
  const displayedParcelPriceType: ParcelPriceType =
    hasSourcedParcelPrice && isParcelPriceType(selectedArea?.parcelPriceType)
      ? selectedArea.parcelPriceType
      : "calculated-asking-price";
  const displayedParcelPriceTypeLabel = hasSourcedParcelPrice
    ? parcelPriceTypeLabel(displayedParcelPriceType)
    : hasParcelUnitPriceOnly
      ? "Average transaction price / m²"
      : parcelPriceTypeLabel("calculated-asking-price");
  const selectedDistrictPriceBenchmark = selectedArea
    ? getDistrictLandPriceBenchmark(selectedArea.district)
    : null;
  const estimatedReferenceBenchmark = selectedArea?.level === "parcel" &&
    typeof selectedArea.parcelSizeM2 === "number" &&
    selectedArea.parcelSizeM2 > 0 &&
    selectedDistrictPriceBenchmark
      ? Math.round(selectedArea.parcelSizeM2 * selectedDistrictPriceBenchmark.averageReferencePricePerM2)
      : null;

  useEffect(() => {
    if (
      nearbyAccessKey === null ||
      nearbyAreaLongitude === null ||
      nearbyAreaLatitude === null ||
      nearbyAreaDistrict === null
    ) {
      return;
    }
    const controller = new AbortController();
    const params = new URLSearchParams({
      lat: String(nearbyAreaLatitude),
      lon: String(nearbyAreaLongitude),
      district: nearbyAreaDistrict
    });
    fetch("/api/geography/nearby-access?" + params.toString(), { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as NearbyAccessResponse;
        if (!response.ok) throw new Error(payload.message ?? "Road access estimates are unavailable.");
        if (!controller.signal.aborted) {
          setNearbyAccessSnapshot({ key: nearbyAccessKey, value: payload });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setNearbyAccessSnapshot({
            key: nearbyAccessKey,
            value: {
              status: "error",
              items: [],
              source: "Valhalla · OpenStreetMap road graph",
              note: "Road-route estimates are not available for this parcel right now."
            }
          });
        }
      });
    return () => controller.abort();
  }, [nearbyAccessKey, nearbyAreaLongitude, nearbyAreaLatitude, nearbyAreaDistrict]);

  useEffect(() => {
    let active = true;
    const loadLandPriceTransactionPrices = async () => {
      try {
        const response = await fetch("/land-price-transaction.tsv");
        if (!response.ok) throw new Error("Land transaction-price snapshot could not be loaded.");
        const text = await response.text();
        if (!active) return;
        setLandPriceRows(parseLandPriceTransactionPrices(text));
        setLandPriceLoadStatus("loaded");
      } catch {
        if (active) setLandPriceLoadStatus("error");
      }
    };
    void loadLandPriceTransactionPrices();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const requestId = ++globalSearchSequenceRef.current;
    const query = globalSearch.trim();
    if (query.length < 2) {
      setGlobalSearchResults([]);
      setGlobalSearchStatus("idle");
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setGlobalSearchStatus("loading");
      try {
        const url = "/api/geography/areas/search?q=" + encodeURIComponent(query);
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error("Place search failed (" + response.status + ")");
        const payload = await response.json() as AreaSearchResponse;
        if (controller.signal.aborted || requestId !== globalSearchSequenceRef.current) return;
        const results: GlobalSearchResult[] = [...(payload.areas ?? [])];
        setGlobalSearchResults(results);
        setGlobalSearchStatus("ready");
      } catch {
        if (controller.signal.aborted || requestId !== globalSearchSequenceRef.current) return;
        setGlobalSearchResults([]);
        setGlobalSearchStatus("error");
      }
    }, 260);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [globalSearch]);

  useEffect(() => {
    const query = compareSearch.trim();
    const shouldBrowseParcels = compareBrowseOpen && query.length === 0;
    if (query.length < 2 && !shouldBrowseParcels) {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setComparisonSearchStatus("loading");
      try {
        const url = shouldBrowseParcels
          ? "/api/geography/areas/search?browse=1&offset=0"
          : "/api/geography/areas/search?q=" + encodeURIComponent(query);
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error("Area search failed (" + response.status + ")");
        const payload = await response.json() as AreaSearchResponse;
        if (controller.signal.aborted) return;
        setComparisonSearchResults(payload.areas ?? []);
        setComparisonSearchStatus("ready");
        setComparisonBrowseOffset(payload.nextOffset ?? 25);
        setComparisonBrowseHasMore(shouldBrowseParcels ? payload.hasMore ?? false : false);
      } catch {
        if (controller.signal.aborted) return;
        setComparisonSearchResults([]);
        setComparisonSearchStatus("error");
        setComparisonBrowseHasMore(false);
      }
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [compareSearch, compareBrowseOpen]);

  const loadMoreComparisonParcels = async () => {
    if (!comparisonBrowseHasMore || comparisonSearchStatus === "loading" || compareSearch.trim()) return;
    setComparisonSearchStatus("loading");
    try {
      const response = await fetch("/api/geography/areas/search?browse=1&offset=" + String(comparisonBrowseOffset));
      if (!response.ok) throw new Error("Parcel browsing failed (" + response.status + ")");
      const payload = await response.json() as AreaSearchResponse;
      if (compareSearch.trim() || !compareBrowseOpen) return;
      setComparisonSearchResults((current) => {
        const known = new Set(current.map((area) => area.id));
        return [...current, ...(payload.areas ?? []).filter((area) => !known.has(area.id))];
      });
      setComparisonBrowseOffset(payload.nextOffset ?? comparisonBrowseOffset + 25);
      setComparisonBrowseHasMore(payload.hasMore ?? false);
      setComparisonSearchStatus("ready");
    } catch {
      setComparisonSearchStatus("error");
    }
  };

  useEffect(() => {
    if (!selectedArea || selectedArea.level === "parcel") return;

    const area = selectedArea;
    const areaKey = transactionEstimateKeyForArea(area);
    const controller = new AbortController();

    const params = new URLSearchParams({ district: area.district, level: area.level });
    if (area.sector) params.set("sector", area.sector);
    if (area.cell) params.set("cell", area.cell);
    if (area.village) params.set("village", area.village);

    const loadEstimate = async () => {
      try {
        const response = await fetch("/api/geography/transaction-estimate?" + params.toString(), {
          signal: controller.signal
        });
        if (!response.ok) throw new Error("Transaction estimate request failed (" + response.status + ")");
        const payload = await response.json() as TransactionEstimateResponse;
        if (controller.signal.aborted) return;
        setSelectedTransactionEstimate(payload);
        setSelectedTransactionEstimateKey(areaKey);
        setSelectedTransactionEstimateStatus("ready");
      } catch {
        if (controller.signal.aborted) return;
        setSelectedTransactionEstimate(null);
        setSelectedTransactionEstimateKey(areaKey);
        setSelectedTransactionEstimateStatus("error");
      }
    };
    void loadEstimate();
    return () => controller.abort();
  }, [selectedArea]);

  useEffect(() => {
    if (selectedArea?.level !== "parcel") return;

    const district = selectedArea.district;
    const upi = selectedArea.upi?.trim() ?? "";
    const matchesSelectedParcel = (current: SelectedArea | null): current is SelectedArea =>
      current !== null &&
      current.level === "parcel" &&
      current.district === district &&
      (current.upi?.trim() ?? "") === upi;

    // Render the initial checking/missing-UPI state from the current parcel.
    // Avoid a synchronous state update in this effect; only async results mutate state.
    if (!upi) return;

    const controller = new AbortController();

    const loadParcelZoning = async () => {
      try {
        const params = new URLSearchParams({ district, upi });
        const response = await fetch("/api/geography/parcel-zoning?" + params.toString(), {
          signal: controller.signal
        });
        if (!response.ok) throw new Error("Parcel zoning lookup failed (" + response.status + ")");
        const payload = await response.json() as {
          status: "found" | "not-covered";
          zones: NonNullable<SelectedArea["zoning"]>;
          source: string | null;
        };
        if (controller.signal.aborted) return;
        setSelectedArea((current) => matchesSelectedParcel(current)
          ? {
              ...current,
              zoning: payload.zones ?? [],
              zoningStatus: payload.status,
              zoningSource: payload.source ?? null
            }
          : current);
      } catch {
        if (controller.signal.aborted) return;
        setSelectedArea((current) => matchesSelectedParcel(current)
          ? { ...current, zoning: [], zoningStatus: "error", zoningSource: null }
          : current);
      }
    };

    void loadParcelZoning();
    return () => controller.abort();
  }, [selectedArea?.level, selectedArea?.district, selectedArea?.upi]);

  useEffect(() => {
    const level = selectedArea?.level;
    const district = selectedArea?.district;
    const sector = selectedArea?.sector;
    const cell = selectedArea?.level === "cell" ? selectedArea.name : null;
    if (level !== "cell" || !district || !sector || !cell) return;

    const controller = new AbortController();
    const lookupKey = [district, sector, cell].join("|");
    const loadCellParcels = async () => {
      try {
        const params = new URLSearchParams({ district, sector, cell });
        const response = await fetch("/api/geography/cell-parcels?" + params.toString(), {
          signal: controller.signal
        });
        if (!response.ok) throw new Error("Cell parcel list request failed.");
        const payload = await response.json() as CellParcelResponse;
        if (controller.signal.aborted) return;
        setCellParcelsLookupKey(lookupKey);
        setCellParcels(payload.parcels ?? []);
        setCellParcelsTotal(payload.totalSourceRecords ?? payload.returnedRecords ?? 0);
        setCellParcelsCapped(payload.capped ?? false);
        setCellParcelsStatus("loaded");
      } catch {
        if (controller.signal.aborted) return;
        setCellParcelsLookupKey(lookupKey);
        setCellParcelsStatus("error");
      }
    };
    void loadCellParcels();
    return () => controller.abort();
  }, [selectedArea?.level, selectedArea?.district, selectedArea?.sector, selectedArea?.name]);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const context = gsap.context(() => {
      gsap.fromTo(
        [toolbarRef.current],
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
    if (!compareOpen && !metricInfoOpen && !metricsOpen && !developersOpen && !projectsOpen && !sourcesOpen && !showOpen && !selectedArea) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;

      // Close the topmost interaction first, leaving the selected map area intact.
      if (compareOpen) {
        setCompareOpen(false);
        return;
      }
      if (metricInfoOpen || metricsOpen || developersOpen || projectsOpen || sourcesOpen || showOpen) {
        setMetricInfoOpen(false);
        setMetricsOpen(false);
        setDevelopersOpen(false);
        setProjectsOpen(false);
        setSourcesOpen(false);
        setShowOpen(false);
        return;
      }
      if (selectedArea) setSelectedArea(null);
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [compareOpen, metricInfoOpen, metricsOpen, developersOpen, projectsOpen, sourcesOpen, showOpen, selectedArea]);

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
              setMetricInfoOpen(false);
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
            Compare{comparedAreas.length > 0 ? ` · ${comparedAreas.length}` : ""}
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
          selectedMetric={selectedMetric}
          showLayers={showLayers}
          showZoning={showZoning}
          showScope="pilot"
          onMapReady={handleMapReady}
          onStatusChange={handleBasemapStatus}
          onBoundaryStatusChange={handleBoundaryStatus}
          onAreaSelected={handleAreaSelected}
          selectedArea={selectedArea}
        />

        <div className="map-vignette" aria-hidden="true" />

        {selectedArea?.level === "parcel" ? (
          <TalkToExpert
            key={`${selectedArea.upi ?? selectedArea.name}:${selectedArea.center?.join(",") ?? ""}`}
            developerName={selectedArea.developerName?.trim() || "Taiseel Development"}
            parcelUpi={selectedArea.upi}
          />
        ) : null}

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
          <button aria-pressed={basemapMode === "hybrid"}
            className={basemapMode === "hybrid" ? "basemap-button basemap-button-active" : "basemap-button"}
            onClick={() => setBasemapMode("hybrid")} type="button">
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
              <path d="M2.5 5.4 10 2.2l7.5 3.2L10 8.6 2.5 5.4Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
              <path d="M2.5 10 10 13.2l7.5-3.2M2.5 14.5 10 17.7l7.5-3.2" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
            </svg>
            Hybrid
          </button>
        </div>

        <div className="map-status-card" aria-label="Map connection status">
          <span
            aria-label={getBasemapLabel(basemapStatus)}
            title={getBasemapLabel(basemapStatus)}
            className={`status-dot status-dot-${basemapStatus}`}
          />
          {basemapStatus !== "ready" ? (
            <span aria-live="polite">{getBasemapLabel(basemapStatus)}</span>
          ) : null}
          <span className="status-divider" aria-hidden="true" />
          <span
            aria-label={getBoundaryLabel(boundaryStatus)}
            title={getBoundaryLabel(boundaryStatus)}
            className={`status-dot status-dot-${boundaryStatus}`}
          />
          {boundaryStatus !== "ready" ? (
            <span aria-live="polite" className="status-secondary">{getBoundaryLabel(boundaryStatus)}</span>
          ) : null}
        </div>

        <div className="map-floating-toolbar" ref={toolbarRef}>
          <div aria-label="Investment map actions" className="map-toolbar investment-toolbar">
            <div className="global-area-search">
              <div className="global-area-search-field">
                <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
                  <circle cx="8.8" cy="8.8" r="5.4" stroke="currentColor" strokeWidth="1.6" />
                  <path d="m13 13 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                <input
                  aria-label="Search addresses, districts, sectors, cells, villages and parcels"
                  aria-expanded={globalSearchOpen}
                  aria-controls="global-area-search-results"
                  autoComplete="off"
                  className="global-area-search-input"
                  onChange={(event) => {
                    setGlobalSearch(event.target.value);
                    setGlobalSearchOpen(true);
                  }}
                  onFocus={() => setGlobalSearchOpen(true)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setGlobalSearchOpen(false);
                    if (event.key === "Enter") {
                      event.preventDefault();
                      const query = globalSearch.trim();
                      const isFullUpi = /^\d{1,2}(?:[/.\-\s]\d{1,2}){3}[/.\-\s]\d{1,7}$/.test(query);
                      const looksLikeAddress = !isFullUpi && (
                        query.includes(",") ||
                        /\b(?:road|street|avenue|drive|close|lane|boulevard|rd|st|ave)\b/i.test(query) ||
                        /^(?:kn|kg|kk)\s*[- ]?\s*\d+/i.test(query)
                      );
                      const addressResult = globalSearchResults.find(
                        (result) => "kind" in result && result.kind === "address"
                      );
                      if (looksLikeAddress && addressResult) {
                        selectGlobalSearchResult(addressResult);
                      } else if (looksLikeAddress || globalSearchResults.length === 0) {
                        void searchGlobalAddress(query);
                      } else {
                        selectGlobalSearchResult(globalSearchResults[0]);
                      }
                    }
                  }}
                  placeholder="Search address, area, UPI…"
                  role="combobox"
                  type="search"
                  value={globalSearch}
                />
                {globalSearch.trim() ? (
                  <button
                    aria-label="Clear map search"
                    className="global-area-search-clear"
                    onClick={() => {
                      setGlobalSearch("");
                      setGlobalSearchOpen(true);
                    }}
                    type="button"
                  >
                    ×
                  </button>
                ) : null}
              </div>
              {globalSearchOpen ? (
                <div aria-label="Search results" className="global-area-search-results" id="global-area-search-results" role="listbox">
                  {globalSearch.trim().length < 2 ? (
                    <p className="global-area-search-message">Search an address, district, sector, cell, village, parcel number or full UPI.</p>
                  ) : globalSearchStatus === "loading" && globalSearchResults.length === 0 ? (
                    <p className="global-area-search-message" role="status">Searching Rwanda…</p>
                  ) : globalSearchStatus === "error" && globalSearchResults.length === 0 ? (
                    <p className="global-area-search-message" role="status">Search is temporarily unavailable.</p>
                  ) : globalSearchResults.length > 0 ? (
                    globalSearchResults.map((result) => {
                      const isAddress = "kind" in result && result.kind === "address";
                      const level = isAddress ? null : (result as AreaSearchResult).level;
                      const area = isAddress ? null : result as AreaSearchResult;
                      return (
                        <button
                          aria-label={isAddress ? "Find address " + result.name : "Find " + level + " " + result.name}
                          className="global-area-search-result"
                          key={result.id}
                          onClick={() => selectGlobalSearchResult(result)}
                          role="option"
                          type="button"
                        >
                          <span className={isAddress ? "global-area-search-symbol global-area-search-address" : "global-area-search-symbol"} aria-hidden="true">
                            {isAddress ? "⌖" : level === "parcel" ? "▱" : "◇"}
                          </span>
                          <span className="global-area-search-copy">
                            <strong>{result.name}</strong>
                            <small>
                              {isAddress
                                ? (result as AddressSearchResult).displayName
                                : [
                                    areaLevelLabel((area as AreaSearchResult).level),
                                    (area as AreaSearchResult).district,
                                    (area as AreaSearchResult).sector,
                                    (area as AreaSearchResult).cell,
                                    (area as AreaSearchResult).village,
                                    (area as AreaSearchResult).level === "parcel" && (area as AreaSearchResult).upi
                                      ? "UPI " + (area as AreaSearchResult).upi
                                      : null
                                  ].filter(Boolean).join(" · ")}
                            </small>
                          </span>
                          <span className="global-area-search-type">
                            {isAddress ? "Address" : areaLevelLabel((area as AreaSearchResult).level)}
                          </span>
                        </button>
                      );
                    })
                  ) : (
                    <p className="global-area-search-message">
                      {globalSearchStatus === "ready"
                        ? "No matching area. Press Enter to search this as an address."
                        : "No matching place found. Try a shorter name or paste the full UPI."}
                    </p>
                  )}
                </div>
              ) : null}
            </div>
            <button
              aria-expanded={developersOpen}
              className={developersOpen ? "toolbar-action toolbar-action-active" : "toolbar-action"}
              onClick={() => {
                setMetricsOpen(false);
                setProjectsOpen(false);
                setSourcesOpen(false);
                setShowOpen(false);
                setMetricInfoOpen(false);
                setDirectoryTab("developers");
                setDevelopersOpen((open) => !open);
              }}
              type="button"
            >
              Developers <span className="toolbar-count">20</span>
            </button>
            <button
              aria-expanded={projectsOpen}
              className={projectsOpen ? "toolbar-action toolbar-action-active" : "toolbar-action"}
              onClick={() => {
                setWorkspaceMode("projects");
                setSelectedArea(null);
                setMetricsOpen(false);
                setDevelopersOpen(false);
                setSourcesOpen(false);
                setShowOpen(false);
                setMetricInfoOpen(false);
                setProjectsOpen((open) => !open);
              }}
              type="button"
            >
              Projects
            </button>
            <button
              aria-label="Market metric"
              aria-expanded={metricsOpen}
              className={metricsOpen ? "toolbar-action toolbar-action-active metrics-trigger" : "toolbar-action metrics-trigger"}
              onClick={() => {
                setDevelopersOpen(false);
                setProjectsOpen(false);
                setSourcesOpen(false);
                setShowOpen(false);
                setMetricInfoOpen(false);
                setMetricsOpen((open) => !open);
              }}
              type="button"
            >
              Metrics <span className="metrics-trigger-value">{activeMetric.shortLabel}</span><span aria-hidden="true">⌄</span>
            </button>
            <button
              aria-label="Show map overlays"
              aria-expanded={showOpen}
              className={showOpen ? "toolbar-action toolbar-action-active" : "toolbar-action"}
              onClick={() => {
                setMetricsOpen(false);
                setDevelopersOpen(false);
                setProjectsOpen(false);
                setSourcesOpen(false);
                setMetricInfoOpen(false);
                setShowOpen((open) => !open);
              }}
              type="button"
            >
              Show <span aria-hidden="true">⌄</span>
            </button>
            <button
              aria-label="Sources and map information"
              aria-expanded={sourcesOpen || metricInfoOpen}
              title="Sources and map information"
              className={sourcesOpen || metricInfoOpen ? "toolbar-action toolbar-action-active metric-info-trigger" : "toolbar-action metric-info-trigger"}
              onClick={() => {
                setMetricsOpen(false);
                setDevelopersOpen(false);
                setProjectsOpen(false);
                setShowOpen(false);
                if (sourcesOpen || metricInfoOpen) {
                  setSourcesOpen(false);
                  setMetricInfoOpen(false);
                } else {
                  setSourcesOpen(true);
                  setMetricInfoOpen(false);
                }
              }}
              type="button"
            >
              <span aria-hidden="true">i</span>
            </button>
          </div>
        </div>


        {showOpen ? (
          <aside aria-label="Show map layers" className="show-menu">
            <div className="show-menu-header">
              <h2>Show</h2>
              <button aria-label="Close map layers" className="panel-close" onClick={() => setShowOpen(false)} type="button">×</button>
            </div>
            <div className="show-option-list">
              {([
                { id: "landmarks" as const, title: "Landmarks" },
                { id: "healthEducation" as const, title: "Medical & schools" },
                { id: "transportation" as const, title: "Transportation" },
                { id: "nature" as const, title: "Nature" }
              ]).map((layer) => {
                const checked = showLayers.includes(layer.id);
                return (
                  <label className={checked ? "show-toggle show-toggle-active" : "show-toggle"} key={layer.id}>
                    <span>{layer.title}</span>
                    <input
                      aria-label={layer.title}
                      checked={checked}
                      onChange={() => {
                        setShowLayers((current) =>
                          current.includes(layer.id)
                            ? current.filter((item) => item !== layer.id)
                            : [...current, layer.id]
                        );
                      }}
                      type="checkbox"
                    />
                    <span className="show-toggle-track" aria-hidden="true"><span /></span>
                    <span className="show-toggle-state">{checked ? "On" : "Off"}</span>
                  </label>
                );
              })}
              <label className={showZoning ? "show-toggle show-toggle-active" : "show-toggle"}>
                <span>Zoning</span>
                <input
                  aria-label="Zoning"
                  checked={showZoning}
                  onChange={() => setShowZoning((value) => !value)}
                  type="checkbox"
                />
                <span className="show-toggle-track" aria-hidden="true"><span /></span>
                <span className="show-toggle-state">{showZoning ? "On" : "Off"}</span>
              </label>
            </div>
          </aside>
        ) : null}

        {metricsOpen ? (
          <aside aria-label="Market metrics menu" className="metrics-menu">
            <div className="metrics-menu-header">
              <div>
                <p className="panel-eyebrow">LAND MARKET / RWANDA</p>
                <h2>Metrics</h2>
              </div>
              <button aria-label="Close metrics menu" className="panel-close" onClick={() => setMetricsOpen(false)} type="button">×</button>
            </div>
            <div className="metrics-menu-section">
              <span className="metrics-section-label">Property type</span>
              <div aria-label="Property type" className="metric-scope-switch" role="group">
                {PROPERTY_SCOPES.map((scope) => {
                  const futureOnly = scope.value === "apartment" || scope.value === "villa";
                  return (
                    <button
                      aria-pressed={propertyScope === scope.value}
                      className={propertyScope === scope.value ? "metric-scope-option metric-scope-option-active" : "metric-scope-option"}
                      disabled={futureOnly}
                      key={scope.value}
                      onClick={() => setPropertyScope(scope.value)}
                      title={futureOnly ? "Building-level datasets are not connected yet." : undefined}
                      type="button"
                    >
                      {scope.label}
                    </button>
                  );
                })}
              </div>
              <p className="metrics-menu-note">This pilot is land-first. Apartment and villa metrics will become available when verified building data is connected; “All” currently shows the available land data.</p>
            </div>
            <div className="metrics-menu-section metrics-menu-period-section">
              <span className="metrics-section-label">Period</span>
              <div aria-label="Analysis period" className="metric-period-switch" role="group">
                {ANALYSIS_PERIODS.map((period) => (
                  <button
                    aria-pressed={analysisPeriod === period.value}
                    className={analysisPeriod === period.value ? "metric-period-option metric-period-option-active" : "metric-period-option"}
                    disabled
                    key={period.value}
                    title="A validated dated series is not connected, so this period cannot filter values yet."
                    type="button"
                  >
                    {period.shortLabel}
                  </button>
                ))}
              </div>
              <p className="metrics-menu-note">Time windows are shown for the reference layout, but are disabled until a dated land-market series is validated.</p>
            </div>
            <div className="metrics-menu-section metrics-options-section">
              <span className="metrics-section-label">Market indicators</span>
              <div className="metrics-option-list">
                {MARKET_METRICS.map((metric) => (
                  <button
                    aria-pressed={selectedMetric === metric.id}
                    className={selectedMetric === metric.id ? "metrics-option metrics-option-active" : "metrics-option"}
                    key={metric.id}
                    onClick={() => {
                      setSelectedMetric(metric.id);
                      setPropertyScope("land");
                      setMetricsOpen(false);
                    }}
                    type="button"
                  >
                    <span className="metrics-option-copy">
                      <strong>{metric.label}</strong>
                      <small>
                        {metric.id === "averageLandPricePerM2"
                          ? "Average transaction price per square metre"
                          : metric.id === "marketSupply"
                            ? "Plots currently listed and ready for sale"
                            : metric.id === "upcomingSupply"
                              ? "Potential future plots not yet ready to enter the market"
                              : metric.description}
                      </small>
                    </span>
                    <span className={metric.id === "averageLandPricePerM2" ? "metric-data-pill metric-data-pill-available" : "metric-data-pill"}>
                      {metric.id === "averageLandPricePerM2"
                        ? "Snapshot only"
                        : metric.id === "transactionVolume"
                          ? "Dashboard only"
                          : "Pending"}
                    </span>
                  </button>
                ))}
              </div>
              <p className="metrics-menu-supply-note"><strong>Supply definitions:</strong> Market supply means plots currently available for sale and ready to transact. Upcoming supply covers a future pipeline that is not yet ready, potentially because subdivision, planning, negotiation or legal/administrative steps remain. No such constraints are inferred or published by this pilot.</p>
              <p className="metrics-menu-quality"><strong>Price-source status:</strong> district values are a provisional dashboard snapshot; effective date and calculation method are not exposed. Cell prices remain provisional until the duplicate keys are reconciled against the full /reference geography and source schema.</p>
              <p className="metrics-menu-quality">
                {landPriceLoadStatus === "loaded"
                  ? `Supplied file diagnostics: ${landPriceDiagnostics.usableRows} usable rows · ${landPriceDiagnostics.malformedRows} malformed rows · ${landPriceDiagnostics.conflictingLocations} conflicting locations. Observation date not supplied.`
                  : landPriceLoadStatus === "error"
                    ? "Supplied file diagnostics unavailable because the file could not be loaded."
                    : "Loading supplied cell-price data and checking source-row quality…"}
              </p>
            </div>
          </aside>
        ) : null}

        {developersOpen ? (
          <aside aria-label="Developer and agent directory" className="directory-drawer">
            <div className="directory-drawer-header">
              <div>
                <p className="panel-eyebrow">RWANDA REAL ESTATE DIRECTORY</p>
                <h2>Developers &amp; agents</h2>
              </div>
              <button aria-label="Close developer directory" className="panel-close" onClick={() => setDevelopersOpen(false)} type="button">×</button>
            </div>
            <div aria-label="Directory category" className="directory-tabs" role="tablist">
              <button aria-selected={directoryTab === "developers"} className={directoryTab === "developers" ? "directory-tab directory-tab-active" : "directory-tab"} onClick={() => { setDirectoryTab("developers"); setDirectorySearch(""); }} role="tab" type="button">Developers</button>
              <button aria-selected={directoryTab === "agencies"} className={directoryTab === "agencies" ? "directory-tab directory-tab-active" : "directory-tab"} onClick={() => { setDirectoryTab("agencies"); setDirectorySearch(""); }} role="tab" type="button">Agencies</button>
              <button aria-selected={directoryTab === "agents"} className={directoryTab === "agents" ? "directory-tab directory-tab-active" : "directory-tab"} onClick={() => { setDirectoryTab("agents"); setDirectorySearch(""); }} role="tab" type="button">Agents</button>
            </div>
            <input aria-label={"Search " + directoryTab} className="directory-search"
              onChange={(event) => setDirectorySearch(event.target.value)} placeholder="Search by name"
              type="search" value={directorySearch} />
            {directoryTab === "developers" ? (
              <>
                <div className="directory-record-list" role="tabpanel">
                  {visibleDeveloperCandidates.map((candidate) => (
                    <article className="directory-record" key={candidate.id}>
                      <div aria-label={candidate.logoUrl ? candidate.name + " logo" : "Organization initials"} className="directory-monogram">
                        <span className="directory-logo-fallback">{initialsForName(candidate.name)}</span>
                        {candidate.logoUrl ? (
                          <img
                            alt={candidate.name + " logo"}
                            className="directory-logo-image"
                            loading="lazy"
                            onError={(event) => { event.currentTarget.style.display = "none"; }}
                            src={candidate.logoUrl}
                          />
                        ) : null}
                      </div>
                      <div className="directory-record-copy">
                        <div className="directory-record-title">
                          <strong>{candidate.name}</strong>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
                <Link className="directory-full-link" href="/developers">Open full developer directory ↗</Link>
              </>
            ) : null}
            {directoryTab === "agencies" ? (
              <div className="directory-record-list" role="tabpanel">
                {visibleAgencies.map((agency) => (
                  <article className="directory-record" key={agency.id}>
                    <div aria-label="Agency initials" className="directory-monogram">{initialsForName(agency.name)}</div>
                    <div className="directory-record-copy">
                      <div className="directory-record-title"><strong>{agency.name}</strong></div>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
            {directoryTab === "agents" ? (
              <div className="directory-record-list" role="tabpanel">
                {visibleAgents.map((agent) => (
                  <article className="directory-record" key={agent.id}>
                    <div aria-label="Agent initials" className="directory-monogram">{initialsForName(agent.name)}</div>
                    <div className="directory-record-copy">
                      <div className="directory-record-title"><strong>{agent.name}</strong></div>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
            <p className="directory-evidence-note">
              Public websites are discovery leads, not verification of current licensing, affiliation, or availability.
              No “top agent” ranking published.
            </p>
          </aside>
        ) : null}

        {projectsOpen ? (
          <aside aria-label="Projects directory panel" className="directory-drawer projects-drawer">
            <div className="directory-drawer-header">
              <div>
                <p className="panel-eyebrow">PROJECT INTELLIGENCE / RWANDA</p>
                <h2>Buildings &amp; off-plan projects</h2>
                <p className="directory-drawer-subtitle">Named developments, apartments, villas, construction stages and future handovers.</p>
              </div>
              <button aria-label="Close projects panel" className="panel-close" onClick={() => setProjectsOpen(false)} type="button">×</button>
            </div>
            <div className="projects-panel-empty">
              <div className="projects-panel-icon" aria-hidden="true">⌂</div>
              <strong>Verified project feed not connected</strong>
              <p>Projects such as residential estates and off-plan buildings will appear here only after their identity, developer, location, stage, current unit availability and publication permission have been checked.</p>
              <Link className="directory-full-link" href="/projects">Open projects workspace ↗</Link>
            </div>
          </aside>
        ) : null}

        {metricInfoOpen ? (
          <aside
            aria-label={workspaceMode === "projects" ? "Project mode information" : "Metric description for " + activeMetric.label}
            className="metric-info-panel"
          >
            <button
              aria-label="Close metric description"
              className="panel-close"
              onClick={() => setMetricInfoOpen(false)}
              type="button"
            >
              ×
            </button>
            <p className="panel-eyebrow">
              {workspaceMode === "projects" ? "PROJECT MODE" : "METRIC DESCRIPTION"}
            </p>
            <h2>{workspaceMode === "projects" ? "Projects mode" : activeMetric.label}</h2>
            <div className="info-panel-tabs" role="tablist" aria-label="Map information sections">
              <button aria-selected={!metricInfoOpen} className={!metricInfoOpen ? "info-panel-tab info-panel-tab-active" : "info-panel-tab"} onClick={() => { setMetricInfoOpen(false); setSourcesOpen(true); }} role="tab" type="button">Sources</button>
              <button aria-selected={metricInfoOpen} className={metricInfoOpen ? "info-panel-tab info-panel-tab-active" : "info-panel-tab"} onClick={() => { setSourcesOpen(false); setMetricInfoOpen(true); }} role="tab" type="button">Map info</button>
            </div>
            <p className="metric-info-description">
              {workspaceMode === "projects"
                ? "Project mode is ready for a verified project feed. This panel brings the map status and publication limits together in one place."
                : activeMetric.description}
            </p>
            {workspaceMode === "projects" ? (
              <div className="metric-info-status">
                <strong>Project data status</strong>
                <p>
                  Developer launches, starting prices, payment plans, construction progress and
                  unit availability are not connected yet. No project markers or prices are fabricated.
                </p>
                <div className="directory-route-links">
                  <Link href="/projects">Open project directory ↗</Link>
                  <Link href="/developers">Developers &amp; agents directory ↗</Link>
                </div>
              </div>
            ) : (
              <>
                <div className="metric-info-unit">
                  <span>Expected unit</span>
                  <strong>
                    {selectedMetric === "averageLandPricePerM2"
                      ? "RWF per m²"
                      : selectedMetric === "transactionVolume"
                        ? "Count of registered land transactions"
                        : selectedMetric === "capitalAppreciation" || selectedMetric === "rentalYield"
                          ? "Percent (%)"
                          : selectedMetric === "marketSupply"
                            ? "Count of active sale/rent listings"
                            : "Count of expected units from verified projects"}
                  </strong>
                </div>
                <div className="metric-info-status">
                  <strong>Data status</strong>
                  <p>{activeMetric.dataStatus}</p>
                </div>
                {selectedMetric === "transactionVolume" ? (
                  <div className="transaction-types-note">
                    <strong>Transaction types to track</strong>
                    <p>
                      Voluntary sale, succession, expropriation, exchange, donation, court decisions and auctions, subdivision, public-land title, parcel merge, and change of land use. Keep counts by type and month so different legal events are not treated as identical market demand.
                    </p>
                    <p>
                      Prioritize Bugesera, Kicukiro, Gasabo and Nyarugenge. Sector, cell and village figures in this app are explicitly labelled parcel-share models, not official transaction counts. The public summary dataset offers finer-level counts but requires approved access before direct integration.
                    </p>
                    <a className="metric-info-source" href={TRANSACTION_DASHBOARD_SOURCE} target="_blank" rel="noreferrer">
                      Open district transaction and type tables ↗
                    </a>
                    <a className="metric-info-source" href={TRANSACTION_BENCHMARK_SOURCE} target="_blank" rel="noreferrer">
                      Open NISR 2025 Statistical Yearbook (2023 historical totals) ↗
                    </a>
                    <a className="metric-info-source" href="https://data.gov.rw/datasets/3cee397e-8da0-418f-a382-b97feffba7ed" target="_blank" rel="noreferrer">
                      Transaction summary dataset · approved access required ↗
                    </a>
                  </div>
                ) : null}
                <div className="metric-info-status">
                  <strong>Map interpretation</strong>
                  <p>
                    Current filters: {selectedMetric === "averageLandPricePerM2" ? (PROPERTY_SCOPES.find((item) => item.value === propertyScope)?.label ?? "Land") + " · static district/cell transaction-price snapshot" : (PROPERTY_SCOPES.find((item) => item.value === propertyScope)?.label ?? "All") + " · " + (ANALYSIS_PERIODS.find((item) => item.value === analysisPeriod)?.label ?? "1 year")}.
                    {selectedMetric === "averageLandPricePerM2"
                      ? " District polygons are shaded by the sourced land-price snapshot. Period filtering is not applied because the source observation date is not exposed; prices for sectors, cells, villages or individual plots are not inferred."
                      : " The map keeps administrative colors for this metric until verified market data can be joined to the polygons."}
                  </p>
                </div>
                {selectedMetric === "averageLandPricePerM2" ? (
                  <div className="land-price-legend" aria-label="Land price heatmap legend">
                    <span>RWF/m²</span>
                    <div className="land-price-legend-scale" />
                    <div className="land-price-legend-labels"><span>Lower</span><span>Higher</span></div>
                  </div>
                ) : null}
                {selectedMetric === "averageLandPricePerM2" ? (
                  <a className="metric-info-source" href={LAND_PRICE_PRICES_CROSSCHECK_SOURCE} target="_blank" rel="noreferrer">
                    Open Rwanda Land Dashboard ↗
                  </a>
                ) : selectedMetric === "transactionVolume" ? (
                  <a className="metric-info-source" href={TRANSACTION_DASHBOARD_SOURCE} target="_blank" rel="noreferrer">
                    Open official transaction dashboard ↗
                  </a>
                ) : selectedMetric === "capitalAppreciation" ? (
                  <a className="metric-info-source" href="https://data.gov.rw/datasets/3cee397e-8da0-418f-a382-b97feffba7ed" target="_blank" rel="noreferrer">
                    Review annual transaction dataset and access terms ↗
                  </a>
                ) : (
                  <p className="metric-info-no-source">No validated Rwanda source is connected for this metric yet.</p>
                )}
                <p className="data-source-note">
                  Administrative boundaries: Kigali City Master Plan and Geodata Rwanda Bugesera Masterplan.
                  Individual parcel polygons: City of Kigali parcel layer for Kigali and an NLA-hosted
                  LAIS Bugesera_Parcels service for Bugesera. Bugesera reuse terms, completeness and
                  current survey accuracy still need confirmation; zoning layers remain separate.
                </p>
              </>
            )}
            {boundaryStatus === "error" ? (
              <p className="metric-info-no-source" role="status">
                Boundary service unavailable. Administrative boundaries may not refresh until the service is restored.
              </p>
            ) : null}
          </aside>
        ) : null}

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
            {selectedArea.level !== "parcel" ? (
              <p className="panel-eyebrow">{selectedArea.level.toUpperCase()}</p>
            ) : null}
            <div className="selected-area-title-row">
              {selectedArea.level === "parcel" ? (
                <span className="parcel-asking-label">Asking price</span>
              ) : (
                <h2>{selectedArea.name}</h2>
              )}
              {selectedArea.level === "parcel" ? (
                selectedArea.parcelMarketStatus ? (
                  <span
                    className={"parcel-market-status-inline parcel-market-status-inline-" + selectedArea.parcelMarketStatus}
                    title="Status supplied by the connected listing source."
                    aria-label={selectedArea.parcelMarketStatus === "available"
                      ? "Land for sale — status supplied by the connected listing source"
                      : "Off the market — status supplied by the connected listing source"}
                  >
                    {selectedArea.parcelMarketStatus === "available" ? "For sale" : "Off market"}
                  </span>
                ) : (
                  <span
                    className="parcel-market-status-inline parcel-market-status-inline-unverified"
                    title="Cadastral parcel geometry does not establish whether land is listed for sale."
                    aria-label="For-sale status unverified; this parcel is not a verified listing"
                  >
                    Availability unverified
                  </span>
                )
              ) : null}
            </div>
            {selectedArea.level === "parcel" ? (
              <div className="parcel-price-headline" aria-label={displayedParcelPriceTypeLabel} title={displayedParcelPriceTypeLabel}>
                <strong>
                  {displayedParcelValue !== null
                    ? "RWF " + new Intl.NumberFormat("en-RW", { maximumFractionDigits: 0 }).format(displayedParcelValue)
                    : "Not available"}
                </strong>
              </div>
            ) : null}
            {selectedArea.level === "parcel" && hasSourcedParcelPrice && selectedArea.parcelPriceSource ? (
              <p className="parcel-price-source">Source: {selectedArea.parcelPriceSource}</p>
            ) : null}
            {selectedArea.level === "parcel" ? (
              <div className="parcel-confidence-strip" aria-label="Parcel data confidence">
                <span
                  className={selectedArea.sourceType === "cadastral-parcel" && selectedArea.upi ? "confidence-chip confidence-chip-record" : "confidence-chip confidence-chip-missing"}
                  title="A cadastral record match identifies this mapped parcel; it is not proof of current legal title or ownership."
                >
                  {selectedArea.sourceType === "cadastral-parcel" && selectedArea.upi ? "Cadastral match" : "Record incomplete"}
                </span>
                <span
                  className={hasSourcedParcelPrice ? "confidence-chip confidence-chip-record" : displayedParcelValue !== null ? "confidence-chip confidence-chip-estimate" : "confidence-chip confidence-chip-missing"}
                  title={hasSourcedParcelPrice ? "A named price source supplied this value." : displayedParcelValue !== null ? "This amount is calculated from parcel area and an available area-level price benchmark." : "No defensible parcel price can be calculated from available data."}
                >
                  {hasSourcedParcelPrice ? "Price sourced" : displayedParcelValue !== null ? "Price estimated" : hasParcelUnitPriceOnly ? "Rate only" : "Price missing"}
                </span>
                {selectedArea.sourceLabel?.toLowerCase().includes("reuse permission pending") ? (
                  <span className="confidence-chip confidence-chip-unverified" title="The source's reuse terms, completeness and current survey accuracy have not been confirmed.">Coverage unverified</span>
                ) : null}
                {selectedArea.zoningStatus === "not-covered" ? (
                  <span className="confidence-chip confidence-chip-missing">Zoning not mapped</span>
                ) : null}
              </div>
            ) : null}
            {selectedArea.level === "parcel" ? (
              <>
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
                  <span>District / ID</span>
                  <strong>
                    {selectedArea.district}
                    {selectedArea.districtId ? ` · ID ${selectedArea.districtId}` : ""}
                  </strong>
                </div>
                <div>
                  <span>Sector / ID</span>
                  <strong>
                    {selectedArea.sector
                      ? `${selectedArea.sector}${selectedArea.sectorId ? ` · ID ${selectedArea.sectorId}` : ""}`
                      : "Not published"}
                  </strong>
                </div>
                <div>
                  <span>Cell / ID</span>
                  <strong>
                    {selectedArea.cell
                      ? `${selectedArea.cell}${selectedArea.cellId ? ` · ID ${selectedArea.cellId}` : ""}`
                      : "Not published"}
                  </strong>
                </div>
                <div>
                  <span>Village / ID</span>
                  <strong>
                    {selectedArea.village
                      ? `${selectedArea.village}${selectedArea.villageId ? ` · ID ${selectedArea.villageId}` : ""}`
                      : "Not published"}
                  </strong>
                </div>
                <div className="parcel-zoning-row">
                  <span>Zoning / planning designation</span>
                  {!selectedArea.upi ? (
                    <strong>Zoning unavailable — parcel identifier is missing</strong>
                  ) : selectedArea.zoningStatus === "loading" || !selectedArea.zoningStatus ? (
                    <strong>Checking mapped zoning…</strong>
                  ) : selectedArea.zoningStatus === "found" ? (
                    selectedArea.zoning?.length ? (
                      selectedArea.zoning.length === 1 ? (
                        <strong>{zoningEntryLabel(selectedArea.zoning[0])}</strong>
                      ) : (
                        <div className="parcel-zoning-results">
                          <strong>Multiple mapped designations</strong>
                          <ul className="parcel-zoning-list">
                            {selectedArea.zoning.map((zone, index) => (
                              <li key={(zone.code ?? zone.name) + "-" + index}>
                                <span>{zoningEntryLabel(zone)}</span>
                              </li>
                            ))}
                          </ul>
                          <small className="parcel-zoning-note">
                            {selectedArea.zoning.some((zone) => zone.sourceListsMultipleCodes)
                              ? "The source lists several codes in one record. Confirm which designation applies with the planning authority."
                              : "This parcel intersects multiple zoning areas. The map cannot determine which rule takes precedence."}
                          </small>
                        </div>
                      )
                    ) : (
                      <strong>Mapped area found, but no zoning label was supplied</strong>
                    )
                  ) : selectedArea.zoningStatus === "not-covered" ? (
                    <strong>No zoning designation mapped for this parcel</strong>
                  ) : (
                    <strong>Zoning data unavailable</strong>
                  )}
                </div>
                <div>
                  <span>{selectedArea.parcelSizeSource === "geometry-estimate" ? "Approx. area from mapped boundary" : "Parcel area"}</span>
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
              <div className="parcel-valuation-comparison" aria-label="Transaction and reference price comparison">
                <div>
                  <span>Average transaction price</span>
                  <strong>
                    {parcelUnitPriceEstimate?.pricePerM2 !== null && parcelUnitPriceEstimate?.pricePerM2 !== undefined
                      ? new Intl.NumberFormat("en-RW", { maximumFractionDigits: 0 }).format(parcelUnitPriceEstimate.pricePerM2) + " RWF/m²"
                      : "Not available"}
                  </strong>
                  <small>{hasSourcedParcelPrice ? "Area-level benchmark for comparison; it is not the displayed parcel price." : "Asking price is calculated as parcel area × the available average transaction price per m². This is an estimate, not a verified listing price."}</small>
                </div>
                <div>
                  <span>Average reference price · district benchmark</span>
                  <strong>
                    {selectedDistrictPriceBenchmark
                      ? new Intl.NumberFormat("en-RW", { maximumFractionDigits: 0 }).format(selectedDistrictPriceBenchmark.averageReferencePricePerM2) + " RWF/m²"
                      : "Not available"}
                  </strong>
                  <small>Separate official dashboard reference-price series.</small>
                </div>
                {estimatedReferenceBenchmark !== null ? (
                  <div className="parcel-reference-total">
                    <span>Reference-price benchmark for this area</span>
                    <strong>RWF {new Intl.NumberFormat("en-RW", { maximumFractionDigits: 0 }).format(estimatedReferenceBenchmark)}</strong>
                    <small>Parcel area × district average reference price. Comparison only; it does not determine the headline estimate.</small>
                  </div>
                ) : null}
              </div>
              <section className="parcel-access-panel" aria-label="Nearby road access">
                <div className="parcel-access-heading">
                  <strong>Location access</strong>
                  <span>By road</span>
                </div>
                {nearbyAccess?.status === "loading" ? (
                  <p className="parcel-access-message" role="status">Checking nearby schools, clinics and transport…</p>
                ) : nearbyAccess?.status === "error" ? (
                  <p className="parcel-access-message" role="status">Road travel estimates are unavailable right now.</p>
                ) : nearbyAccess?.items.length ? (
                  <ul className="parcel-access-list">
                    {nearbyAccess.items.map((item) => (
                      <li key={item.id}>
                        <span className="parcel-access-category">{item.category}</span>
                        <strong>{item.name}</strong>
                        <small>
                          {item.routeStatus === "routed" && item.distanceKm !== null && item.timeMinutes !== null
                            ? `${item.distanceKm < 1 ? item.distanceKm.toFixed(2) : item.distanceKm.toFixed(1)} km · about ${Math.max(1, Math.round(item.timeMinutes))} min`
                            : "Road route unavailable"}
                        </small>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="parcel-access-message" role="status">No mapped schools, clinics or transport stops found nearby.</p>
                )}
                <small className="parcel-access-note">
                  {nearbyAccess?.note ?? "Estimated drive times · OSM amenity coverage may be incomplete."}
                </small>
              </section>
              </>
            ) : (
              <>
                <div aria-label="Selected area market metrics" className="area-market-grid">
                  <article className="area-market-card area-market-card-featured">
                    <span>{selectedArea.level === "sector" && selectedArea.averageLandPriceKind === "derived-unweighted-cell-mean" ? "Indicative transaction-price mean / m²" : "Average transaction price / m²"}</span>
                    <strong>
                      {selectedArea.level === "district" && selectedArea.averageLandPricePerM2 !== null
                        ? `${new Intl.NumberFormat("en-RW", { maximumFractionDigits: 0 }).format(selectedArea.averageLandPricePerM2)} RWF`
                        : selectedArea.level === "sector" && selectedArea.averageLandPricePerM2 !== null
                          ? `${new Intl.NumberFormat("en-RW", { maximumFractionDigits: 0 }).format(selectedArea.averageLandPricePerM2)} RWF`
                          : selectedArea.level === "cell" && selectedLandPrice?.status === "found" && selectedLandPrice.price !== null
                            ? `${new Intl.NumberFormat("en-RW", { maximumFractionDigits: 0 }).format(selectedLandPrice.price)} RWF`
                            : selectedLandPrice?.status === "ambiguous"
                            ? "Conflicting source values"
                            : selectedArea.level === "sector"
                              ? "Sector average not supplied"
                              : "Not available"}
                    </strong>
                    <small>
                      {selectedArea.level === "district" && selectedArea.averageLandPricePerM2 !== null
                        ? "Rwanda Land Dashboard /reference · explicitly labelled Avg Transaction Price; reviewed 25 Oct 2026. Observation date and weighting method are not disclosed; /prices differs for Nyarugenge."
                        : selectedArea.level === "sector" && selectedArea.averageLandPriceKind === "derived-unweighted-cell-mean"
                          ? `Indicative arithmetic mean of ${selectedArea.averageLandPriceSampleSize ?? 0} unambiguous cell-level weighted-average transaction-price snapshots, rounded to RWF. This is not an official sector weighted average. ${selectedArea.averageLandPriceConflictingCells ?? 0} conflicting cell values were excluded; source dates and methodology remain unverified.`
                          : landPriceLoadStatus === "loading"
                            ? "Loading the supplied sector/cell transaction-price table…"
                            : landPriceLoadStatus === "error"
                              ? "The supplied transaction-price table could not be loaded; no value is inferred."
                              : selectedArea.level === "sector"
                                ? `No defensible sector estimate is available. The source file contains cell-level transaction-price values, not an official sector weighted transaction price.`
                                : selectedArea.level === "cell" && selectedLandPrice?.status === "found"
                                ? `Supplied cell-level weighted-average transaction-price snapshot · observation date and calculation method not supplied; not yet reconciled with the dashboard output. Source row ${selectedLandPrice.sourceLines.join(", ")}.`
                                : selectedArea.level === "cell" && selectedLandPrice?.status === "ambiguous"
                                  ? `Conflicting values on source rows ${selectedLandPrice.sourceLines.join(", ")}. The dashboard /prices table also repeats some location keys; no value is selected until the publisher clarifies row identity.`
                                  : selectedArea.level === "cell"
                                    ? "No exact district + sector + cell match in the supplied file. District-level land prices are not a valid substitute; No district average is substituted and no price is inferred."
                                    : "This source is at cell level; no village or individual-parcel price is inferred."}
                    </small>
                  </article>
                  <article className="area-market-card">
                    <span>Transaction volume · monthly indicator</span>
                    <strong>
                      {activeTransactionEstimateKey !== selectedTransactionEstimateKey || selectedTransactionEstimateStatus === "loading"
                        ? "Loading…"
                        : transactionEstimateForSelected?.estimate !== null && transactionEstimateForSelected?.estimate !== undefined
                          ? transactionEstimateForSelected.status === "reported-current-month-unverified"
                            ? new Intl.NumberFormat("en-RW", { maximumFractionDigits: 0 }).format(transactionEstimateForSelected.estimate) + "*"
                            : "≈ " + new Intl.NumberFormat("en-RW", { maximumFractionDigits: 0 }).format(transactionEstimateForSelected.estimate)
                          : "Unavailable"}
                    </strong>
                    <small>
                      {transactionEstimateForSelected?.status === "reported-current-month-unverified"
                        ? "User-reported Bugesera month-to-date dashboard reading, observed 24 Oct 2026 and not independently reconciled. An indexed overview separately showed 4,031; 4,350 is not a live verified feed."
                        : transactionEstimateForSelected?.status === "historical-monthly-baseline"
                          ? "Historical baseline: official 2023 annual district transactions ÷ 12. This is not the current month's count."
                          : transactionEstimateForSelected?.status === "parcel-share-model"
                            ? transactionEstimateForSelected.method
                            : activeTransactionEstimateKey !== selectedTransactionEstimateKey || selectedTransactionEstimateStatus === "loading"
                              ? "Calculating a sourced activity indicator…"
                              : "No current verified count is available for this area."}
                    </small>
                    <a className="metric-info-source" href={TRANSACTION_DASHBOARD_SOURCE} target="_blank" rel="noreferrer">
                      Official dashboard ↗
                    </a>
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
                {selectedArea.level === "cell" ? (
                  <section aria-label="Land parcels inside selected cell" className="cell-parcel-list">
                    <div className="cell-parcel-list-heading">
                      <div>
                        <h3>Land parcels in {selectedArea.name}</h3>
                        <p>Parcel records for this cell. Select a row to zoom to the plot.</p>
                      </div>
                      <span>
                        {activeCellParcelsStatus === "loaded"
                          ? cellParcels.length.toLocaleString("en-RW")
                          : activeCellParcelsStatus === "loading"
                            ? "Loading…"
                            : "UPI"}
                      </span>
                    </div>
                    {activeCellParcelsStatus === "loading" ? (
                      <p className="cell-parcel-message" role="status">Loading parcel identifiers and areas from the connected cadastral source…</p>
                    ) : activeCellParcelsStatus === "error" ? (
                      <p className="cell-parcel-message" role="status">The parcel list could not be loaded. The administrative cell and its market indicators remain available.</p>
                    ) : activeCellParcelsStatus === "loaded" && cellParcels.length === 0 ? (
                      <p className="cell-parcel-message" role="status">No matching parcel records were returned for this exact cell name. Try the map at parcel zoom, and verify the source&#39;s administrative names.</p>
                    ) : activeCellParcelsStatus === "loaded" ? (
                      <>
                        <div className="cell-parcel-table-head">
                          <span>Parcel / UPI</span>
                          <span>Area</span>
                        </div>
                        <div className="cell-parcel-rows">
                          {cellParcels.map((parcel) => (
                            <button
                              className="cell-parcel-row"
                              onClick={() => {
                                const [west, south, east, north] = parcel.bounds;
                                const mobile = window.matchMedia("(max-width: 720px)").matches;
                                if (mapInstance) {
                                  mapInstance.fitBounds(
                                    [[west, south], [east, north]],
                                    {
                                      padding: mobile
                                        ? { top: 150, bottom: 150, left: 18, right: 18 }
                                        : { top: 120, bottom: 70, left: 336, right: 72 },
                                      maxZoom: 19.4,
                                      duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 620
                                    }
                                  );
                                }
                                setSelectedArea({
                                  level: "parcel",
                                  name: parcel.parcelNumber ? "Parcel " + parcel.parcelNumber : "Parcel " + parcel.upi,
                                  province: selectedArea.province,
                                  district: parcel.district,
                                  districtId: selectedArea.districtId,
                                  sector: parcel.sector,
                                  sectorId: selectedArea.sectorId,
                                  cell: parcel.cell,
                                  cellId: selectedArea.cellId,
                                  village: parcel.village,
                                  villageId: null,
                                  averageLandPricePerM2: null,
                                  sourceLabel: parcel.district.toLowerCase() === "bugesera"
                                    ? "National Land Authority · LAIS Bugesera_Parcels FeatureServer (reuse permission pending)"
                                    : "City of Kigali Master Plan · Kigali Parcels layer (1 June 2026)",
                                  sourceType: "cadastral-parcel",
                                  upi: parcel.upi,
                                  parcelNumber: parcel.parcelNumber,
                                  parcelSizeM2: parcel.areaM2,
                                  wetlandAreaM2: parcel.wetlandAreaM2,
                                  lastUpdatedOn: parcel.lastUpdatedOn,
                                  bounds: parcel.bounds
                                });
                              }}
                              key={parcel.id}
                              type="button"
                              title={"Zoom to UPI " + parcel.upi}
                            >
                              <span className="cell-parcel-row-main">
                                <strong>{parcel.parcelNumber ? "Parcel " + parcel.parcelNumber : "Parcel record"}</strong>
                                <small>{parcel.upi}</small>
                                {parcel.village ? <small>{parcel.village} Village</small> : null}
                              </span>
                              <span className="cell-parcel-area">
                                {typeof parcel.areaM2 === "number"
                                  ? new Intl.NumberFormat("en-RW", { maximumFractionDigits: 0 }).format(parcel.areaM2) + " m²"
                                  : "Area unavailable"}
                              </span>
                            </button>
                          ))}
                        </div>
                        <p className="cell-parcel-message">
                          {cellParcelsTotal.toLocaleString("en-RW")} source records matched this cell.
                          {cellParcelsCapped ? " The API response limit was reached; this list may not be complete." : ""}
                          Parcel shapes identify land records but do not prove legal title or current ownership.
                        </p>
                      </>
                    ) : null}
                  </section>
                ) : null}
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
                  <div className="directory-route-links">
                    <Link href="/projects">Open project directory ↗</Link>
                    <Link href="/developers">Developers &amp; agents directory ↗</Link>
                  </div>
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
        ) : null}

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
            <p className="panel-eyebrow">MAP INFORMATION</p>
            <h2>Sources &amp; map details</h2>
            <div className="info-panel-tabs" role="tablist" aria-label="Map information sections">
              <button aria-selected={!metricInfoOpen} className={!metricInfoOpen ? "info-panel-tab info-panel-tab-active" : "info-panel-tab"} onClick={() => { setMetricInfoOpen(false); setSourcesOpen(true); }} role="tab" type="button">Sources</button>
              <button aria-selected={metricInfoOpen} className={metricInfoOpen ? "info-panel-tab info-panel-tab-active" : "info-panel-tab"} onClick={() => { setSourcesOpen(false); setMetricInfoOpen(true); }} role="tab" type="button">Map info</button>
            </div>
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
                <p>Parcel geometry, UPI, parcel number, area and sector/cell/village names are connected for both. Bugesera district/sector/cell IDs come from UPI codes; village IDs are joined only on an unambiguous cell + exact-name match. Reuse permission, completeness and survey accuracy still need confirmation.</p>
              </div>
            </div>
            <div className="source-register-item">
              <span className="source-register-status source-register-connected" />
              <div>
                <strong>Planning and zoning</strong>
                <p>Parcel zoning is looked up against the published Kigali proposed-zoning layer and Bugesera District Land Use Plan. A parcel can intersect more than one mapped designation; confirm interpretation with the relevant planning authority.</p>
              </div>
            </div>
            <div className="source-register-item">
              <span className="source-register-status source-register-pending" />
              <div>
                <strong>Land transaction summaries</strong>
                <p>Source identified · normalized feed not connected; approved-use terms still apply</p>
              </div>
            </div>
            <div className="source-register-item">
              <span className="source-register-status source-register-pending" />
              <div>
                <strong>Show contextual place overlays</strong>
                <p>OpenStreetMap / Overpass · landmarks, health and education, primary roads and bus stops, parks, nature reserves, lakes and waterfalls. Coverage depends on mapping completeness; results are clipped to the pilot district boundaries.</p>
                <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap attribution and licence ↗</a>
              </div>
            </div>
            <div className="source-register-item">
              <span className="source-register-status source-register-pending" />
              <div>
                <strong>Average district land prices</strong>
                <p>The /reference comparison explicitly separates average transaction price from average reference price. Valuations use transaction price; reference prices are shown only as a separate benchmark. Nyarugenge is 50,865 RWF/m² on /reference versus 50,771 on /prices; discrepancy remains unresolved. The supplied cell snapshot has 2 malformed rows and 10 conflicting keys; conflicting cell prices are withheld.</p>
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
              href="https://masterplan.kigalicity.gov.rw/server/rest/services/Masterplan2020/Masterplan2020_22Apr2026/MapServer/117"
              rel="noreferrer"
              target="_blank"
            >
              Open Kigali zoning layer ↗
            </a>
            <a
              className="source-register-link"
              href="https://geodata.rw/server/rest/services/masterplan/Bugesera_DLUP/FeatureServer/0"
              rel="noreferrer"
              target="_blank"
            >
              Open Bugesera zoning layer ↗
            </a>
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
              href={LAND_PRICE_PRICES_CROSSCHECK_SOURCE}
              rel="noreferrer"
              target="_blank"
            >
              Open National Land Dashboard prices ↗
            </a>
            <a className="source-register-link" href={LAND_PRICE_BENCHMARK_SOURCE} rel="noreferrer" target="_blank">
              Open National Land Dashboard average transaction/reference prices ↗
            </a>
            <a className="source-register-link" href={TRANSACTION_DASHBOARD_SOURCE} rel="noreferrer" target="_blank">
              Open National Land Dashboard transaction analysis ↗
            </a>
            <a className="source-register-link" href="https://rwandalanddashboard.lands.rw/ownership" rel="noreferrer" target="_blank">
              Open National Land Dashboard ownership ↗
            </a>
            <a className="source-register-link" href="https://rwandalanddashboard.lands.rw/land-use" rel="noreferrer" target="_blank">
              Open National Land Dashboard land use ↗
            </a>
            <a className="source-register-link" href="https://rwandalanddashboard.lands.rw/" rel="noreferrer" target="_blank">
              Open National Land Dashboard overview ↗
            </a>
            <a
              className="source-register-link"
              href="https://data.gov.rw/datasets/3cee397e-8da0-418f-a382-b97feffba7ed"
              rel="noreferrer"
              target="_blank"
            >
              Open transaction-volume dataset metadata ↗
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
              individual title documents. The Bugesera layer exposes parcel IDs, area and administrative names, but its ArcGIS licence-information field is blank. Written permission to reuse/redistribute, data completeness and current survey accuracy must be confirmed before commercial reliance.
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
            <p className="panel-eyebrow">COMPARISON</p>
            <div className="comparison-title-row">
              <div>
                <h2 id="comparison-title">Compare</h2>
                <p className="comparison-subtitle">Compare districts, sectors, cells, villages, cadastral parcels and projects.</p>
              </div>
              <span>{comparedAreas.length} selected</span>
            </div>
            <label className="comparison-search-label" htmlFor="comparison-area-search">Find an area or parcel</label>
            <input autoComplete="off" className="comparison-search" id="comparison-area-search"
              onFocus={() => { if (!compareSearch.trim()) { setCompareBrowseOpen(true); setComparisonBrowseOffset(0); } }}
              onChange={(event) => {
                const value = event.target.value;
                setCompareSearch(value);
                const normalizedQuery = value.trim();
                setCompareBrowseOpen(normalizedQuery.length === 0);
                setComparisonBrowseOffset(0);
                setComparisonBrowseHasMore(false);
                if (normalizedQuery.length > 0 && normalizedQuery.length < 2) {
                  setComparisonSearchResults([]);
                  setComparisonSearchStatus("idle");
                }
              }}
              placeholder="District, sector, cell, village, UPI or parcel number" type="search" value={compareSearch} />
            {compareBrowseOpen || normalizedComparisonSearch.length >= 2 ? (
              <div aria-label="Matching areas and parcels" className="comparison-search-results" role="listbox">
                {comparisonSearchStatus === "loading" && comparisonSearchResults.length === 0 ? (
                  <p className="comparison-no-results" role="status">{compareBrowseOpen ? "Loading parcels…" : "Searching…"}</p>
                ) : comparisonSearchStatus === "error" && comparisonSearchResults.length === 0 ? (
                  <p className="comparison-no-results" role="status">Search is temporarily unavailable.</p>
                ) : comparisonSearchResults.length > 0 ? (
                  <>
                    {comparisonSearchResults.map((area) => {
                      const candidate: ComparisonItem = { ...area, comparisonKind: "area" };
                      const isAdded = comparedAreas.some((existing) => comparisonItemKey(existing) === comparisonItemKey(candidate));
                      return (
                        <button aria-selected={isAdded} className="comparison-search-result" disabled={isAdded} key={area.id}
                          onClick={() => {
                            addAreaToComparison(area);
                            if (!isAdded) {
                              setCompareSearch("");
                              setCompareBrowseOpen(false);
                              setComparisonSearchResults([]);
                              setComparisonSearchStatus("idle");
                              setComparisonBrowseHasMore(false);
                            }
                          }}
                          role="option" type="button">
                          <span className="comparison-search-dot" aria-hidden="true" />
                          <span className="comparison-search-result-copy">
                            <strong>{area.name}</strong>
                            <small>
                              {areaLevelLabel(area.level)} · {area.district}
                              {area.sector ? " · " + area.sector : ""}{area.cell ? " · " + area.cell : ""}
                              {area.village ? " · " + area.village : ""}
                              {area.level === "parcel" ? " · " + (area.parcelNumber ? "Parcel " + area.parcelNumber : "Parcel") + " · UPI " + (area.upi ?? "not supplied") : ""}
                            </small>
                          </span>
                          <span className="comparison-search-result-action">{isAdded ? "Added" : "Add"}</span>
                        </button>
                      );
                    })}
                    {compareBrowseOpen && comparisonBrowseHasMore ? (
                      <button className="comparison-load-more" disabled={comparisonSearchStatus === "loading"}
                        onClick={() => void loadMoreComparisonParcels()} type="button">
                        {comparisonSearchStatus === "loading" ? "Loading…" : "Load more parcels"}
                      </button>
                    ) : null}
                  </>
                ) : (
                  <p className="comparison-no-results">{comparisonSearchStatus === "ready"
                    ? (compareBrowseOpen ? "No more parcels in the connected sources." : "No matching area or parcel found.")
                    : "Enter at least two characters to search."}</p>
                )}
              </div>
            ) : null}
            <div className="comparison-project-add">
              <span className="comparison-project-add-title">Add a project</span>
              <input
                aria-label="Project name"
                autoComplete="off"
                className="comparison-search"
                onChange={(event) => setCompareProjectName(event.target.value)}
                placeholder="Project name"
                type="text"
                value={compareProjectName}
              />
              <input
                aria-label="Project source URL (optional)"
                autoComplete="url"
                className="comparison-search"
                onChange={(event) => setCompareProjectUrl(event.target.value)}
                placeholder="Source URL (optional)"
                type="url"
                value={compareProjectUrl}
              />
              <button className="comparison-project-add-button" onClick={addManualProjectToComparison} type="button">
                Add project
              </button>
              <small>Project metrics remain unpopulated until a verified, permitted feed is connected.</small>
            </div>
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
                        key={comparisonItemKey(area)}
                      >
                        <span>{area.comparisonKind === "project" ? "Project · " + area.name : areaLevelLabel(area.level) + " · " + area.name}</span>
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
                            key={comparisonItemKey(area)}
                          >
                            <span>{area.comparisonKind === "project" ? area.name : area.name}</span>
                            <small>{area.comparisonKind === "project" ? "Project · no verified feed" : areaLevelLabel(area.level) + " · " + area.district}</small>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {comparedAreas.some((area) => area.comparisonKind !== "project" && area.level === "parcel") ? (
                        <>
                          <tr key="parcel-asking-price">
                            <th scope="row">Asking price</th>
                            {comparedAreas.map((area) => {
                              const item = comparisonParcelAskingPrices.find((entry) => entry.key === comparisonItemKey(area));
                              const price = item?.askingPrice ?? null;
                              const isLowestAsk = price !== null && lowestComparisonAskingPrice !== null && price === lowestComparisonAskingPrice;
                              return <td key={"parcel-asking-price-" + comparisonItemKey(area)}>
                                {area.comparisonKind === "project" ? <span>No verified project data</span>
                                : area.level !== "parcel" ? <span>Not a parcel</span>
                                : price !== null ? (
                                  <div className="comparison-price-cell">
                                    <span>RWF {new Intl.NumberFormat("en-RW", { maximumFractionDigits: 0 }).format(price)}</span>
                                    {isLowestAsk ? <span className="comparison-row-leader" aria-label="Lowest comparable asking price"><span aria-hidden="true">★</span> Lowest ask</span> : null}
                                    {item?.area.parcelPriceSource ? <small>Source-supplied price</small> : <small>Estimated from area × price/m²</small>}
                                  </div>
                                ) : <span>Price unavailable</span>}
                              </td>;
                            })}
                          </tr>
                          <tr key="parcel-area">
                            <th scope="row">Parcel area (m²)</th>
                            {comparedAreas.map((area) => {
                              const size = area.comparisonKind !== "project" && area.level === "parcel" &&
                                typeof area.parcelSizeM2 === "number" && Number.isFinite(area.parcelSizeM2)
                                  ? area.parcelSizeM2 : null;
                              const isLargest = size !== null && largestComparisonParcelArea !== null && size === largestComparisonParcelArea;
                              return <td key={"parcel-area-" + comparisonItemKey(area)}>
                                {size !== null ? <div className="comparison-price-cell">
                                  <span>{new Intl.NumberFormat("en-RW", { maximumFractionDigits: 0 }).format(size)} m²</span>
                                  {isLargest ? <span className="comparison-row-leader" aria-label="Largest compared parcel"><span aria-hidden="true">★</span> Largest area</span> : null}
                                </div> : <span>{area.comparisonKind === "project" ? "No verified project data" : area.level === "parcel" ? "Area not supplied" : "Not a parcel"}</span>}
                              </td>;
                            })}
                          </tr>
                          <tr key="parcel-zoning">
                            <th scope="row">Zoning</th>
                            {comparedAreas.map((area) => {
                              const zoningStatus = area.comparisonZoningStatus;
                              const zones = area.comparisonZoning ?? [];
                              return <td key={"parcel-zoning-" + comparisonItemKey(area)}>
                                {area.comparisonKind === "project" ? <span>No verified project data</span>
                                : area.level !== "parcel" ? <span>Not a parcel</span>
                                : zoningStatus === "loading" ? <span>Loading…</span>
                                : zoningStatus === "found" && zones.length > 0 ? <div className="comparison-price-cell">
                                  <span>{zones.map((zone) => zone.code && !zone.name.toLowerCase().startsWith(zone.code.toLowerCase()) ? zone.code + " — " + zone.name : zone.name).join(", ")}</span>
                                </div>
                                : zoningStatus === "not-covered" ? <span>No mapped zoning</span>
                                : <span>Zoning unavailable</span>}
                              </td>;
                            })}
                          </tr>
                        </>
                      ) : null}
                      {MARKET_METRICS.map((metric) => (
                        <tr key={metric.id}>
                          <th scope="row">{metric.shortLabel}</th>
                          {comparedAreas.map((area) => {
                            const key = comparisonItemKey(area);
                            const unitPrice = area.comparisonKind === "project" ? null : getUnitPriceEstimate(landPriceRows, area);
                            const landPrice = metric.id === "averageLandPricePerM2" ? unitPrice?.pricePerM2 ?? null : null;
                            const transaction = area.transactionEstimate;
                            const isPriceLeader = landPrice !== null && lowestComparisonPrice !== null && landPrice === lowestComparisonPrice;
                            return (
                              <td key={metric.id + "-" + key}>
                                {metric.id === "averageLandPricePerM2" ? (
                                  landPrice !== null ? (
                                    <div className="comparison-price-cell">
                                      <span>{new Intl.NumberFormat("en-RW", { maximumFractionDigits: 0 }).format(landPrice)} RWF/m²</span>
                                      {isPriceLeader ? (
                                        <span className="comparison-row-leader" aria-label="Lowest comparable price per square metre">
                                          <span aria-hidden="true">★</span> Lowest RWF/m²
                                        </span>
                                      ) : null}
                                      <small>{unitPrice?.explanation}</small>
                                    </div>
                                  ) : (
                                    <span>{area.comparisonKind === "project"
                                      ? "No verified project data"
                                      : unitPrice?.kind === "conflicting"
                                        ? "Conflicting reference values"
                                        : "No comparable price"}</span>
                                  )
                                ) : metric.id === "transactionVolume" ? (
                                  transaction?.estimate !== null && transaction?.estimate !== undefined ? (
                                    <div className="comparison-price-cell">
                                      <span>
                                        {transaction.status === "reported-current-month-unverified"
                                          ? new Intl.NumberFormat("en-RW", { maximumFractionDigits: 0 }).format(transaction.estimate) + "*"
                                          : "≈ " + new Intl.NumberFormat("en-RW", { maximumFractionDigits: 0 }).format(transaction.estimate)}
                                      </span>
                                      <small>
                                        {transaction.status === "reported-current-month-unverified"
                                          ? "User-reported current month; unverified"
                                          : transaction.status === "historical-monthly-baseline"
                                            ? "2023 annual count ÷ 12; historical baseline"
                                            : "Modelled from parcel-count share; not official"}
                                      </small>
                                    </div>
                                  ) : (
                                    <span>{area.comparisonKind === "project"
                                      ? "No verified project data"
                                      : area.level === "parcel"
                                        ? "Not applicable to a parcel"
                                        : transaction?.method ?? "Loading / no verified estimate"}</span>
                                  )
                                ) : (
                                  <span>{area.comparisonKind === "project" ? "No verified project data" : "Pending verified data"}</span>
                                )}
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
