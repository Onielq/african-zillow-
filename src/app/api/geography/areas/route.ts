import { NextRequest, NextResponse } from "next/server";
import { DISTRICT_LAND_PRICE_BENCHMARKS, LAND_PRICE_BENCHMARK_SOURCE } from "@/data/land-price-benchmarks";
import { LAND_PRICE_TRANSACTION_ROWS } from "@/data/land-price-transaction.generated";

export const runtime = "nodejs";

const KIGALI_MASTERPLAN_MAP_SERVER =
  "https://masterplan.kigalicity.gov.rw/server/rest/services/Masterplan2020/Masterplan2020_22Apr2026/MapServer";
const BUGESERA_MASTERPLAN_MAP_SERVER =
  "https://geodata.rw/server/rest/services/Overlays/Bugesera_Masterplan/MapServer";
const KIGALI_PARCEL_FEATURE_LAYER =
  "https://masterplan.kigalicity.gov.rw/server/rest/services/Hosted/Kigali_Parcels_1June2026_for_search/FeatureServer/0";
const BUGESERA_PARCEL_FEATURE_LAYER =
  "https://services7.arcgis.com/htgaiKX6RV2DDGgK/arcgis/rest/services/Bugesera_Parcels/FeatureServer/0";

const INCLUDED_DISTRICTS = ["GASABO", "KICUKIRO", "NYARUGENGE", "BUGESERA"] as const;
const KIGALI_DISTRICTS = ["GASABO", "KICUKIRO", "NYARUGENGE"] as const;

// The public Kigali parcels layer includes UPI, parcel number, size, wetland
// overlap and last-updated date. It is an identification layer, not proof of
// current ownership or encumbrances.
// Values from the explicitly labelled "Avg Transaction Price (m²)" column in
// the Rwanda Land Dashboard /reference comparison table. The observation date
// and weighting method are not disclosed. Nyarugenge differs from /prices
// (50,771 vs 50,865 RWF/m²); this route uses the named transaction-price value
// and keeps the cross-page discrepancy documented.
const DISTRICT_AVERAGE_TRANSACTION_PRICE_RWF_PER_M2: Record<string, number> = Object.fromEntries(
  Object.entries(DISTRICT_LAND_PRICE_BENCHMARKS).map(([district, benchmark]) => [
    district.toUpperCase(),
    benchmark.averageTransactionPricePerM2
  ])
) as Record<string, number>;
const DISTRICT_TRANSACTION_PRICE_SOURCE = LAND_PRICE_BENCHMARK_SOURCE;

// Broad service extents are used only to avoid requesting an unrelated GIS
// service for a viewport outside its coverage.
const KIGALI_GIS_EXTENT: Bounds = [29.58, -2.12, 30.32, -1.47];
const BUGESERA_GIS_EXTENT: Bounds = [29.82, -2.62, 30.56, -1.92];
const KIGALI_PARCEL_EXTENT: Bounds = [29.6223, -2.0794, 30.2772, -1.4870];

const RWANDA_BOUNDS = {
  west: 28.7,
  south: -2.95,
  east: 31.05,
  north: -1.0
};

type Bounds = [number, number, number, number];
type Position2D = [number, number];

type ArcGisGeometry = {
  rings?: unknown;
  type?: string;
  coordinates?: unknown;
  spatialReference?: { wkid?: number; latestWkid?: number };
};

type UpstreamFeature = {
  id?: string | number;
  geometry?: ArcGisGeometry | null;
  properties?: Record<string, unknown> | null;
  attributes?: Record<string, unknown> | null;
};

type UpstreamCollection = {
  features?: UpstreamFeature[];
  error?: { code?: number; message?: string; details?: string[] };
};

function emptyCollection() {
  return { type: "FeatureCollection" as const, features: [] };
}

function parseBounds(value: string | null): Bounds | null {
  if (!value) return null;

  const numbers = value.split(",").map((part) => Number(part.trim()));
  if (
    numbers.length !== 4 ||
    numbers.some((number) => !Number.isFinite(number))
  ) {
    return null;
  }

  const [rawWest, rawSouth, rawEast, rawNorth] = numbers;
  if (
    rawWest >= rawEast ||
    rawSouth >= rawNorth ||
    rawWest < -180 ||
    rawEast > 180 ||
    rawSouth < -90 ||
    rawNorth > 90
  ) {
    return null;
  }

  const west = Math.max(rawWest, RWANDA_BOUNDS.west);
  const south = Math.max(rawSouth, RWANDA_BOUNDS.south);
  const east = Math.min(rawEast, RWANDA_BOUNDS.east);
  const north = Math.min(rawNorth, RWANDA_BOUNDS.north);

  if (west >= east || south >= north) return null;

  // Keep the viewport query envelope at sub-metre coordinate precision.
  // Rounding to 3 decimals can skip parcels near the visible map edges.
  return [
    Number(west.toFixed(6)),
    Number(south.toFixed(6)),
    Number(east.toFixed(6)),
    Number(north.toFixed(6))
  ];
}

function textValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
  return null;
}

function isPosition(value: unknown): value is Position2D {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number" &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  );
}

function closeRing(value: unknown): Position2D[] | null {
  if (!Array.isArray(value)) return null;

  const ring = value.filter(isPosition).map(([x, y]) => [x, y] as Position2D);
  if (ring.length < 3) return null;

  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push([first[0], first[1]]);
  }

  return ring.length >= 4 ? ring : null;
}

function signedRingArea(ring: Position2D[]): number {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const current = ring[i];
    const next = ring[i + 1];
    area += current[0] * next[1] - next[0] * current[1];
  }
  return area / 2;
}

function pointInRing(point: Position2D, ring: Position2D[]): boolean {
  const [x, y] = point;
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];

    const crosses =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi || Number.EPSILON) + xi;

    if (crosses) inside = !inside;
  }

  return inside;
}

function normaliseShell(ring: Position2D[]): Position2D[] {
  return signedRingArea(ring) < 0 ? [...ring].reverse() : ring;
}

function normaliseHole(ring: Position2D[]): Position2D[] {
  return signedRingArea(ring) > 0 ? [...ring].reverse() : ring;
}

function arcGisPolygonToGeoJson(geometry: ArcGisGeometry | null | undefined) {
  if (!geometry) return null;

  if (
    typeof geometry.type === "string" &&
    Array.isArray(geometry.coordinates)
  ) {
    return {
      type: geometry.type,
      coordinates: geometry.coordinates
    };
  }

  if (!Array.isArray(geometry.rings)) return null;

  const rings = geometry.rings
    .map(closeRing)
    .filter((ring): ring is Position2D[] => ring !== null);

  if (rings.length === 0) return null;

  // ArcGIS polygon JSON convention: exterior rings are clockwise and
  // interior rings are counter-clockwise. Convert those rings to GeoJSON.
  let shells = rings.filter((ring) => signedRingArea(ring) < 0);
  let holes = rings.filter((ring) => signedRingArea(ring) > 0);

  // Be defensive if a service emits rings with non-standard orientation.
  if (shells.length === 0) {
    shells = rings;
    holes = [];
  }

  const polygons = shells.map((shell) => ({
    shell: normaliseShell(shell),
    holes: [] as Position2D[][]
  }));

  for (const hole of holes) {
    const sample = hole[0];
    const containing = polygons
      .filter((polygon) => pointInRing(sample, polygon.shell))
      .sort(
        (a, b) =>
          Math.abs(signedRingArea(a.shell)) -
          Math.abs(signedRingArea(b.shell))
      );

    if (containing.length > 0) {
      containing[0].holes.push(normaliseHole(hole));
    }
  }

  const coordinates = polygons.map((polygon) => [
    polygon.shell,
    ...polygon.holes
  ]);

  if (coordinates.length === 1) {
    return {
      type: "Polygon",
      coordinates: coordinates[0]
    };
  }

  return {
    type: "MultiPolygon",
    coordinates
  };
}

type AreaLevel = "district" | "sector" | "cell" | "village";

function boundsIntersect(a: Bounds, b: Bounds): boolean {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

function normaliseFieldName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function attributeValue(
  attributes: Record<string, unknown>,
  candidates: string[]
): unknown {
  const entries = Object.entries(attributes).map(([key, value]) => ({
    key: normaliseFieldName(key),
    value
  }));

  // Prefer exact field names before trying schema variants such as District_1.
  for (const candidate of candidates) {
    const wanted = normaliseFieldName(candidate);
    const match = entries.find((entry) => entry.key === wanted);
    if (match) return match.value;
  }

  return null;
}

type CellPriceEntry = {
  price: number | null;
  conflict: boolean;
  sourceRows: number[];
};
type SectorPriceEntry = {
  mean: number | null;
  pricedCells: number;
  conflictingCells: number;
};
type LandPriceIndex = {
  cells: Map<string, CellPriceEntry>;
  sectors: Map<string, SectorPriceEntry>;
};
let landPriceIndexPromise: Promise<LandPriceIndex> | null = null;

function normalisePricePart(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en");
}

function cellPriceKey(district: string, sector: string, cell: string): string {
  return [district, sector, cell].map(normalisePricePart).join("|");
}

function sectorPriceKey(district: string, sector: string): string {
  return [district, sector].map(normalisePricePart).join("|");
}

async function getLandPriceIndex(): Promise<LandPriceIndex> {
  if (!landPriceIndexPromise) {
    // The TSV is converted into a bundled TypeScript module at install/build
    // time. Reading public/ with node:fs at request time is not reliable in
    // Workers because deployed static assets are not runtime filesystem files.
    landPriceIndexPromise = Promise.resolve().then(() => {
      const groups = new Map<string, {
        district: string;
        sector: string;
        cell: string;
        prices: Set<number>;
        sourceRows: number[];
      }>();
      for (const row of LAND_PRICE_TRANSACTION_ROWS) {
        const [, districtValue, sectorValue, cellValue, price, sourceRow] = row;
        const district = districtValue.trim();
        const sector = sectorValue.trim();
        const cell = cellValue.trim();
        if (!district || !sector || !cell || !Number.isFinite(price) || price <= 0) continue;
        const key = cellPriceKey(district, sector, cell);
        const group = groups.get(key) ?? {
          district,
          sector,
          cell,
          prices: new Set<number>(),
          sourceRows: []
        };
        group.prices.add(price);
        group.sourceRows.push(sourceRow);
        groups.set(key, group);
      }

      const cells = new Map<string, CellPriceEntry>();
      const sectorValues = new Map<string, { prices: number[]; conflicts: number }>();
      for (const [key, group] of groups) {
        const conflict = group.prices.size !== 1;
        const price = conflict ? null : (Array.from(group.prices)[0] ?? null);
        cells.set(key, { price, conflict, sourceRows: group.sourceRows });
        const sectorKey = sectorPriceKey(group.district, group.sector);
        const aggregate = sectorValues.get(sectorKey) ?? { prices: [], conflicts: 0 };
        if (price !== null) aggregate.prices.push(price);
        if (conflict) aggregate.conflicts += 1;
        sectorValues.set(sectorKey, aggregate);
      }

      const sectors = new Map<string, SectorPriceEntry>();
      for (const [key, aggregate] of sectorValues) {
        sectors.set(key, {
          mean: aggregate.prices.length
            ? aggregate.prices.reduce((sum, value) => sum + value, 0) / aggregate.prices.length
            : null,
          pricedCells: aggregate.prices.length,
          conflictingCells: aggregate.conflicts
        });
      }
      return { cells, sectors };
    }).catch((error) => {
      landPriceIndexPromise = null;
      throw error;
    });
  }
  return landPriceIndexPromise;
}
function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

type BugeseraUpiLocationIds = {
  provinceId: string | null;
  districtId: string | null;
  sectorId: string | null;
  cellId: string | null;
};

/**
 * UPI contains province/district/sector/cell codes before the parcel number.
 * Match the live Bugesera administrative-ID format (e.g. 5/07/08/01/936 ->
 * province 5, district 57, sector 5708, cell 570801). Village is not encoded
 * in UPI and is joined in the map only by unique cell ID + exact village name.
 */
function bugeseraLocationIdsFromUpi(upi: string): BugeseraUpiLocationIds {
  const parts = upi.split("/");
  const isDigits = (part: string) =>
    part.length > 0 && [...part].every((character) => character >= "0" && character <= "9");
  if (parts.length !== 5 || !parts.every(isDigits)) {
    return { provinceId: null, districtId: null, sectorId: null, cellId: null };
  }

  const provinceCode = parts[0] ?? "";
  const districtCode = parts[1] ?? "";
  const sectorCode = parts[2] ?? "";
  const cellCode = parts[3] ?? "";
  if (!provinceCode || !districtCode || !sectorCode || !cellCode) {
    return { provinceId: null, districtId: null, sectorId: null, cellId: null };
  }

  const districtId = `${provinceCode}${Number(districtCode)}`;
  const sectorId = `${districtId}${sectorCode.padStart(2, "0")}`;
  const cellId = `${sectorId}${cellCode.padStart(2, "0")}`;

  return { provinceId: provinceCode, districtId, sectorId, cellId };
}

async function queryArcGisLayer(
  layerUrl: string,
  bounds: Bounds,
  resultRecordCount?: number,
  where = "1=1",
  outFields = "*",
  revalidateSeconds = 300,
  timeoutMs = 15_000,
  includeViewportGeometry = true
): Promise<UpstreamFeature[]> {
  const upstreamUrl = new URL(`${layerUrl}/query`);
  // Request the provider's full polygon geometry. Do not set maxAllowableOffset
  // or geometryPrecision: either can generalize or round parcel boundary vertices.
  const params = new URLSearchParams({
    where,
    outFields,
    outSR: "4326",
    returnGeometry: "true",
    f: "json"
  });
  if (includeViewportGeometry) {
    params.set("geometry", bounds.join(","));
    params.set("geometryType", "esriGeometryEnvelope");
    params.set("inSR", "4326");
    params.set("outSR", "4326");
    params.set("spatialRel", "esriSpatialRelIntersects");
  }

  // Older MapServer layers reject resultRecordCount because they do not
  // support pagination. Leave that parameter off for admin boundaries, and
  // set it only for the newer parcel FeatureServer, which supports pagination.
  if (typeof resultRecordCount === "number") {
    params.set("resultRecordCount", String(resultRecordCount));
  }

  upstreamUrl.search = params.toString();

  // Some serverless runtimes do not consistently terminate a hung outbound
  // fetch when AbortSignal.timeout fires. Race the request against an explicit
  // deadline as well, and abort the network request when the deadline expires.
  const controller = new AbortController();
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  const fetchPromise = fetch(upstreamUrl, {
    headers: { Accept: "application/json" },
    next: { revalidate: revalidateSeconds },
    signal: controller.signal
  });
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      controller.abort();
      reject(new Error(`ArcGIS layer request timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  let response: Response;
  try {
    response = await Promise.race([fetchPromise, timeoutPromise]);
  } finally {
    if (timeoutHandle !== null) clearTimeout(timeoutHandle);
  }

  if (!response.ok) {
    throw new Error(`ArcGIS layer request failed (${response.status})`);
  }

  const payload = (await response.json()) as UpstreamCollection;
  if (payload.error) {
    throw new Error(
      `ArcGIS error ${payload.error.code ?? "unknown"}: ${payload.error.message ?? "request failed"}`
    );
  }

  return payload.features ?? [];
}

function normaliseAdministrativeFeature(
  feature: UpstreamFeature,
  level: AreaLevel,
  sourceId: "kigali" | "bugesera",
  priceIndex: LandPriceIndex
) {
  const attributes = feature.attributes ?? feature.properties ?? {};
  const activeNameCandidates: Record<AreaLevel, string[]> = {
    district: ["district", "district_name", "district_1", "dist_name", "name"],
    sector: ["sector", "sector_name", "sector_1", "name"],
    cell: ["cell", "cell_name", "cell_1", "cellule_1", "name"],
    village: ["village", "village_name", "village_1", "name"]
  };
  const activeName = textValue(attributeValue(attributes, activeNameCandidates[level]));
  const district =
    (level === "district" ? activeName : textValue(attributeValue(attributes, [
      "district", "district_name", "district_1", "dist_name"
    ]))) ?? (sourceId === "bugesera" ? "Bugesera" : null);
  const sector =
    (level === "sector" ? activeName : textValue(attributeValue(attributes, [
      "sector", "sector_name", "sector_1"
    ])));
  const cell =
    (level === "cell" ? activeName : textValue(attributeValue(attributes, [
      "cell", "cell_name", "cell_1", "cellule_1"
    ])));
  const village =
    (level === "village" ? activeName : textValue(attributeValue(attributes, [
      "village", "village_name", "village_1"
    ])));
  const province = sourceId === "bugesera"
    ? "Eastern Province"
    : textValue(attributeValue(attributes, [
        "province", "prov_name", "province_name", "province_e"
      ])) ?? "Kigali City";
  const geometry = arcGisPolygonToGeoJson(feature.geometry);

  if (!activeName || !district || !geometry) return null;
  if (!({ district, sector, cell, village }[level])) return null;

  const objectId = textValue(attributeValue(attributes, [
    "objectid", "objectid_1", "objectid_12", "fid", "id"
  ]));
  const districtId = textValue(attributeValue(attributes, [
    "district_id", "districtid", "dist_id", "distr_id", "distid", "code_dist"
  ]));
  const sectorId = textValue(attributeValue(attributes, [
    "sector_id", "sectorid", "sect_id", "sectid", "code_sect"
  ]));
  const cellId = textValue(attributeValue(attributes, [
    "cell_id", "cellid", "code_cell_"
  ]));
  const villageId = textValue(attributeValue(attributes, [
    "village_id", "villageid", "code_village", "code_vill"
  ]));
  const idByLevel = {
    district: districtId ?? objectId ?? district,
    sector: sectorId ?? objectId ?? `${district}-${sector ?? "unknown"}`,
    cell: cellId ?? objectId ?? `${district}-${sector ?? "unknown"}-${cell ?? "unknown"}`,
    village: villageId ?? objectId ?? `${district}-${sector ?? "unknown"}-${cell ?? "unknown"}-${village ?? "unknown"}`
  };
  const upperDistrict = district.toUpperCase();
  const sectorPrice = level === "sector" && sector
    ? priceIndex.sectors.get(sectorPriceKey(district, sector))
    : undefined;
  const cellPrice = level === "cell" && sector && cell
    ? priceIndex.cells.get(cellPriceKey(district, sector, cell))
    : undefined;

  return {
    type: "Feature" as const,
    id: `${sourceId}-${level}-${idByLevel[level]}`,
    geometry,
    properties: {
      province,
      province_id: textValue(attributeValue(attributes, ["province_id", "prov_id", "code_prov"])),
      district,
      district_id: districtId,
      ...(level !== "district" ? { sector, sector_id: sectorId } : {}),
      ...(level === "cell" || level === "village" ? { cell, cell_id: cellId } : {}),
      ...(level === "village" ? { village, village_id: villageId } : {}),
      ...(level === "sector" && sectorPrice?.mean !== null && sectorPrice?.mean !== undefined
        ? {
            average_land_price_per_m2: Math.round(sectorPrice.mean),
            average_land_price_kind: "derived-unweighted-cell-mean",
            average_land_price_sample_size: sectorPrice.pricedCells,
            average_land_price_conflicting_cells: sectorPrice.conflictingCells,
            average_land_price_source: "public/land-price-transaction.tsv",
            average_land_price_date_status: "Derived unweighted mean of unambiguous cell-level weighted-average transaction-price snapshots; not an official sector weighted transaction price. Source observation date and method are unknown."
          }
        : {}),
      ...(level === "cell" && cellPrice?.price !== null && cellPrice?.price !== undefined
        ? {
            average_land_price_per_m2: cellPrice.price,
            average_land_price_kind: "supplied-cell-price-snapshot",
            average_land_price_source: "public/land-price-transaction.tsv",
            average_land_price_date_status: "Supplied cell-level weighted-average transaction-price snapshot; effective date and calculation method are unknown."
          }
        : {}),
      ...(level === "cell" && cellPrice?.conflict
        ? {
            average_land_price_conflicting: true,
            average_land_price_conflicting_cells: 1,
            average_land_price_source: "public/land-price-transaction.tsv"
          }
        : {}),
      source_label: sourceId === "kigali"
        ? "Kigali City Master Plan administrative boundaries (April 2026 map service)"
        : level === "cell"
          ? "Bugesera Masterplan GIS · NISR cell boundary metadata lists capture year 2012"
          : "Bugesera Masterplan GIS administrative boundaries (source vintage to confirm)",
      source_type: "administrative-boundary",
      ...(level === "district" &&
      DISTRICT_AVERAGE_TRANSACTION_PRICE_RWF_PER_M2[upperDistrict] !== undefined
        ? {
            average_land_price_per_m2:
              DISTRICT_AVERAGE_TRANSACTION_PRICE_RWF_PER_M2[upperDistrict],
            average_land_price_source: DISTRICT_TRANSACTION_PRICE_SOURCE,
            average_land_price_date_status: "Provisional Avg Transaction Price from the /reference comparison table reviewed 2026-10-25; observation date and weighting method are not disclosed. The /prices page differs for Nyarugenge by 94 RWF/m²."
          }
        : {})
    }
  };
}

function intersectionBounds(a: Bounds, b: Bounds): Bounds | null {
  const clipped: Bounds = [
    Math.max(a[0], b[0]),
    Math.max(a[1], b[1]),
    Math.min(a[2], b[2]),
    Math.min(a[3], b[3])
  ];
  return clipped[0] < clipped[2] && clipped[1] < clipped[3] ? clipped : null;
}

function uniqueAdministrativeFeatures(features: UpstreamFeature[]): UpstreamFeature[] {
  const unique = new Map<string, UpstreamFeature>();
  for (const feature of features) {
    const attributes = feature.attributes ?? feature.properties ?? {};
    const suppliedId = textValue(attributeValue(attributes, ["objectid", "fid", "globalid", "id"]));
    const hierarchy = ["district", "sector", "cell", "village", "name", "name_e"]
      .map((field) => textValue(attributeValue(attributes, [field])) ?? "")
      .join("|");
    const key = suppliedId ?? (hierarchy !== "|||||" ? hierarchy : String(feature.id ?? unique.size));
    if (!unique.has(key)) unique.set(key, feature);
  }
  return Array.from(unique.values());
}

/**
 * MapServer can intermittently return HTTP 500 or time out on larger windows.
 * Retry once, then split the viewport so one failed Bugesera query does not
 * erase every administrative polygon from the map.
 */
async function queryAdministrativeLayerResilient(
  layerUrl: string,
  bounds: Bounds,
  depth = 0
): Promise<UpstreamFeature[]> {
  let lastError: unknown;
  // Only the original viewport gets a retry. Once subdivided, each child gets
  // one bounded request; this caps a fully failed lookup at 22 GIS calls.
  const maxAttempts = depth === 0 ? 2 : 1;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await queryArcGisLayer(layerUrl, bounds, undefined, "1=1", "*", 3_600, 8_000);
    } catch (error) {
      lastError = error;
      if (attempt + 1 < maxAttempts) await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }

  const area = Math.max(0, bounds[2] - bounds[0]) * Math.max(0, bounds[3] - bounds[1]);
  if (depth >= 2 || area <= 0.00002) {
    throw lastError instanceof Error ? lastError : new Error("Administrative map data is temporarily unavailable.");
  }

  const collected: UpstreamFeature[] = [];
  let successfulChildren = 0;
  for (const child of splitBoundsIntoQuarters(bounds)) {
    const clippedChild = intersectionBounds(child, bounds);
    if (!clippedChild) continue;
    try {
      const features = await queryAdministrativeLayerResilient(layerUrl, clippedChild, depth + 1);
      successfulChildren += 1;
      collected.push(...features);
    } catch {
      // Keep successful neighboring tiles when a single sub-window fails.
    }
  }
  if (successfulChildren > 0) return uniqueAdministrativeFeatures(collected);
  throw lastError instanceof Error ? lastError : new Error("Administrative map data is temporarily unavailable.");
}

async function getAdministrativeAreas(
  level: AreaLevel,
  bounds: Bounds,
  sourceFilter?: "kigali" | "bugesera"
): Promise<NextResponse> {
  const sources = [
    {
      id: "kigali" as const,
      baseUrl: KIGALI_MASTERPLAN_MAP_SERVER,
      layerId: { district: 4, sector: 5, cell: 6, village: 7 }[level],
      extent: KIGALI_GIS_EXTENT
    },
    {
      id: "bugesera" as const,
      baseUrl: BUGESERA_MASTERPLAN_MAP_SERVER,
      layerId: { district: 2, sector: 4, cell: 3, village: 5 }[level],
      extent: BUGESERA_GIS_EXTENT
    }
  ].filter((source) =>
    (!sourceFilter || source.id === sourceFilter) &&
    boundsIntersect(bounds, source.extent)
  );

  const results = await Promise.all(sources.map(async (source) => {
    try {
      const sourceBounds = intersectionBounds(bounds, source.extent);
      if (!sourceBounds) {
        return { sourceId: source.id, features: [] as UpstreamFeature[], failed: false };
      }
      let upstreamFeatures: UpstreamFeature[];
      if (source.id === "bugesera") {
        // Bugesera's administrative layers are small (district, sector, cell,
        // village) and its spatial-envelope requests have intermittently returned
        // HTTP 500 for particular viewports. Read the full layer once from the
        // upstream data cache, avoiding repeated map-pan query failures.
        try {
          upstreamFeatures = await queryArcGisLayer(
            `${source.baseUrl}/${source.layerId}`,
            sourceBounds,
            undefined,
            "1=1",
            "*",
            3_600,
            8_000,
            false
          );
        } catch {
          // Keep a viewport-scoped retry as a fallback if the full layer fails.
          upstreamFeatures = await queryAdministrativeLayerResilient(
            `${source.baseUrl}/${source.layerId}`,
            sourceBounds
          );
        }
      } else {
        upstreamFeatures = await queryAdministrativeLayerResilient(
          `${source.baseUrl}/${source.layerId}`,
          sourceBounds
        );
      }
      return {
        sourceId: source.id,
        features: upstreamFeatures,
        failed: false
      };
    } catch (error) {
      console.error(`Administrative GIS request failed for ${source.id}.`, error);
      return { sourceId: source.id, features: [], failed: true };
    }
  }));

  if (sources.length > 0 && results.every((result) => result.failed)) {
    return NextResponse.json(
      { error: "The administrative boundary sources are temporarily unavailable." },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }

  const priceIndex = await getLandPriceIndex();
  const features = results
    .flatMap((result) => result.features.map((feature) =>
      normaliseAdministrativeFeature(feature, level, result.sourceId, priceIndex)
    ))
    .filter((feature): feature is NonNullable<typeof feature> => feature !== null)
    .filter((feature) =>
      INCLUDED_DISTRICTS.includes(
        feature.properties.district.toUpperCase() as (typeof INCLUDED_DISTRICTS)[number]
      )
    );

  return NextResponse.json(
    { type: "FeatureCollection", features },
    {
      headers: {
        "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
        "X-Data-Source": "Kigali City Master Plan; Geodata Rwanda Bugesera Masterplan",
        "X-Data-Basis": "Kigali admin service dated April 2026; Bugesera cell layer metadata lists NISR capture 2012"
      }
    }
  );
}

type ParcelProvider = {
  id: "kigali" | "bugesera";
  layerUrl: string;
  extent: Bounds;
};

function splitBoundsIntoQuarters(bounds: Bounds): Bounds[] {
  const [west, south, east, north] = bounds;
  const midX = (west + east) / 2;
  const midY = (south + north) / 2;
  return [
    [west, south, midX, midY],
    [midX, south, east, midY],
    [west, midY, midX, north],
    [midX, midY, east, north]
  ];
}

function uniqueUpiFeatures(features: UpstreamFeature[]): UpstreamFeature[] {
  const unique = new Map<string, UpstreamFeature>();
  for (const feature of features) {
    const attributes = feature.attributes ?? feature.properties ?? {};
    const upi = textValue(attributeValue(attributes, ["upi"]));
    const key = upi ? "upi:" + upi : "feature:" + String(feature.id ?? unique.size);
    if (!unique.has(key)) unique.set(key, feature);
  }
  return Array.from(unique.values());
}

async function queryParcelChildren(
  provider: ParcelProvider,
  children: Bounds[],
  depth: number,
  parentBudget: { remaining: number }
): Promise<{ features: UpstreamFeature[]; failed: boolean }> {
  // Query neighbouring tiles concurrently. Serial tile requests caused dense
  // Bugesera viewports to wait for several GIS timeouts before the map could draw.
  const initialBudget = parentBudget.remaining;
  const baseAllocation = Math.floor(initialBudget / children.length);
  const remainder = initialBudget % children.length;
  const results = await Promise.all(children.map(async (child, index) => {
    const allocation = baseAllocation + (index < remainder ? 1 : 0);
    const childBudget = { remaining: allocation };
    const result = await queryParcelBounds(provider, child, depth, childBudget);
    return {
      result,
      used: allocation - childBudget.remaining
    };
  }));
  parentBudget.remaining = Math.max(0, initialBudget - results.reduce((sum, item) => sum + item.used, 0));
  const succeeded = results.filter((item) => !item.result.failed).length;
  const collected = results.flatMap((item) => item.result.features);
  return { features: uniqueUpiFeatures(collected), failed: succeeded === 0 && collected.length === 0 };
}

async function queryParcelBounds(
  provider: ParcelProvider,
  bounds: Bounds,
  depth = 0,
  budget: { remaining: number } = { remaining: 900 }
): Promise<{ features: UpstreamFeature[]; failed: boolean }> {
  if (!boundsIntersect(bounds, provider.extent) || budget.remaining <= 0) {
    return { features: [], failed: false };
  }

  const area = Math.max(0, bounds[2] - bounds[0]) * Math.max(0, bounds[3] - bounds[1]);
  const splitBounds = splitBoundsIntoQuarters(bounds).filter((child) => boundsIntersect(child, provider.extent));

  // Do not load a whole-district parcel payload into one serverless request.
  // Query smaller geographic tiles sequentially and stop after a bounded batch.
  const splitBeforeQuery = area > 0.01 && depth < 2;
  if (splitBeforeQuery) {
    return queryParcelChildren(provider, splitBounds, depth + 1, budget);
  }

  try {
    const features = await queryArcGisLayer(
      provider.layerUrl,
      bounds,
      300,
      "upi IS NOT NULL",
      "upi,province,district,sector,cell,village,parcel_number,size,area_in_wetland,last_updated_on",
      180,
      15_000
    );

    // A very dense tile may still contain thousands of records. Subdivide it,
    // drop the oversized parent response, and keep only the smaller children.
    if (features.length >= 280 && depth < 3 && budget.remaining >= 64 && splitBounds.length > 0) {
      const splitResult = await queryParcelChildren(provider, splitBounds, depth + 1, budget);
      if (splitResult.features.length > 0 || !splitResult.failed) return splitResult;

      // Keep a small bounded fallback only when subdivision itself failed.
      const fallback = features.slice(0, Math.min(budget.remaining, 80));
      budget.remaining -= fallback.length;
      return { features: fallback, failed: fallback.length === 0 };
    }

    const bounded = features.slice(0, budget.remaining);
    budget.remaining -= bounded.length;
    return { features: bounded, failed: false };
  } catch (error) {
    // Splitting a query can recover from an oversized spatial window, but it
    // cannot recover from an upstream gateway outage or a timed-out small tile.
    // Stop here so one unavailable provider cannot hold the map open for minutes.
    const errorName = error && typeof error === "object" && "name" in error
      ? String((error as { name?: unknown }).name ?? "")
      : "";
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isTransientUpstreamFailure =
      /ArcGIS layer request failed \((?:502|503|504)\)/.test(errorMessage) ||
      /timeout|timed out|fetch failed|ECONNRESET|EAI_AGAIN|aborted/i.test(errorName + " " + errorMessage);
    if (isTransientUpstreamFailure || depth >= 2 || area <= 0.00002) {
      console.error("Cadastral parcel GIS tile failed for " + provider.id + ".", error);
      return { features: [], failed: true };
    }

    return queryParcelChildren(provider, splitBounds, depth + 1, budget);
  }
}

type ParcelGeoJsonFeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: { type: "Polygon" | "MultiPolygon"; coordinates: unknown };
    properties: { source_type?: string; upi?: string; [key: string]: unknown };
    [key: string]: unknown;
  }>;
};

type ParcelFallbackOutcome = {
  response: NextResponse | null;
  status: "used" | "skipped" | "failed";
  reason?: string;
};

async function fetchVercelParcelFallback(
  bounds: Bounds,
  sourceFilter: "kigali" | "bugesera" | undefined,
  unavailableProviders: string[],
  allowFallback: boolean
): Promise<ParcelFallbackOutcome> {
  // Cloudflare's Worker runtime can fail to reach the public ArcGIS endpoints
  // even when the same query succeeds in Vercel's runtime. Use Vercel only as
  // a server-to-server failover after every primary provider has failed.
  // Vercel does not use this fallback, so this cannot recurse back into itself.
  if (!allowFallback) {
    return { response: null, status: "skipped", reason: "not-cloudflare-runtime" };
  }

  const fallbackOrigin = (
    process.env.TAISEEL_GIS_FALLBACK_ORIGIN || "https://rwanda-land-intelligence.vercel.app"
  ).replace(/\/+$/, "");
  let url: URL;
  try {
    url = new URL("/api/geography/areas", fallbackOrigin);
  } catch {
    return { response: null, status: "failed", reason: "invalid-fallback-origin" };
  }
  url.searchParams.set("level", "parcel");
  if (sourceFilter) url.searchParams.set("source", sourceFilter);
  url.searchParams.set("bbox", bounds.join(","));

  const controller = new AbortController();
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  const fallbackPromise = (async () => {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error("Vercel parcel fallback returned HTTP " + response.status);
    }
    return await response.json() as unknown;
  })();
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      controller.abort();
      reject(new Error("Vercel parcel fallback timed out after 10 seconds"));
    }, 10_000);
  });

  let payload: unknown;
  try {
    payload = await Promise.race([fallbackPromise, timeoutPromise]);
  } catch (error) {
    console.error("Vercel parcel fallback failed.", error);
    const message = error instanceof Error ? error.message : String(error);
    const httpStatus = message.match(/returned HTTP (\d{3})/);
    const reason = /timed out/i.test(message)
      ? "vercel-timeout"
      : httpStatus
        ? "vercel-http-" + httpStatus[1]
        : "vercel-fetch-or-parse-error";
    return { response: null, status: "failed", reason };
  } finally {
    if (timeoutHandle !== null) clearTimeout(timeoutHandle);
  }

  if (
    !payload ||
    typeof payload !== "object" ||
    !("type" in payload) ||
    payload.type !== "FeatureCollection" ||
    !("features" in payload) ||
    !Array.isArray(payload.features)
  ) {
    console.error("Vercel parcel fallback returned an invalid FeatureCollection.");
    return { response: null, status: "failed", reason: "invalid-feature-collection" };
  }

  const collection = payload as ParcelGeoJsonFeatureCollection;
  if (collection.features.length === 0) {
    console.error("Vercel parcel fallback returned no cadastral parcel features.");
    return { response: null, status: "failed", reason: "vercel-empty-feature-collection" };
  }
  const containsUnverifiedGeometry = collection.features.some((feature) =>
    !feature ||
    feature.type !== "Feature" ||
    !feature.geometry ||
    !["Polygon", "MultiPolygon"].includes(feature.geometry.type) ||
    feature.properties?.source_type !== "cadastral-parcel" ||
    typeof feature.properties?.upi !== "string"
  );
  if (containsUnverifiedGeometry) {
    console.error("Vercel parcel fallback returned a feature without cadastral geometry and UPI.");
    return { response: null, status: "failed", reason: "invalid-cadastral-feature" };
  }

  console.warn(unavailableProviders.length
    ? "Parcel geometry served by Vercel fallback after Cloudflare GIS provider failures: " + unavailableProviders.join(", ")
    : "Parcel geometry served by the Vercel fast path on Cloudflare.");

  return {
    response: NextResponse.json(collection, {
      headers: {
        "Cache-Control": "public, max-age=0, s-maxage=180, stale-while-revalidate=900",
        "X-Data-Source": "City of Kigali Master Plan parcels; National Land Authority LAIS Bugesera_Parcels",
        "X-Parcel-Coverage": "Cadastral parcel polygons queried for this viewport by the Vercel parcel API",
        "X-Parcel-Fallback-Source": "Vercel production parcel API",
        "X-Parcel-Fallback-Status": "used",
        "X-Parcel-Provider-Warning": unavailableProviders.length
          ? "Primary GIS provider(s) unavailable in Cloudflare: " + unavailableProviders.join(", ")
          : "Vercel parcel fast path selected for the Cloudflare Worker."
      }
    }),
    status: "used"
  };
}

async function getParcels(
  bounds: Bounds,
  sourceFilter: "kigali" | "bugesera" | undefined,
  allowVercelFallback: boolean
): Promise<NextResponse> {
  // These providers publish individual parcel polygons. Do not replace a
  // missing cadastral polygon with a road edge, image trace, or zoning polygon.
  const parcelProviders: ParcelProvider[] = [
    {
      id: "kigali",
      layerUrl: KIGALI_PARCEL_FEATURE_LAYER,
      extent: KIGALI_PARCEL_EXTENT
    },
    {
      id: "bugesera",
      layerUrl: BUGESERA_PARCEL_FEATURE_LAYER,
      extent: BUGESERA_GIS_EXTENT
    }
  ];
  const providers = parcelProviders.filter((provider) =>
    (!sourceFilter || provider.id === sourceFilter) &&
    boundsIntersect(bounds, provider.extent)
  );

  if (providers.length === 0) {
    return NextResponse.json(emptyCollection(), {
      headers: {
        "Cache-Control": "public, max-age=0, s-maxage=300",
        "X-Data-Source": "National Land Authority Bugesera LAIS and City of Kigali parcel services",
        "X-Parcel-Coverage": "Individual cadastral parcel polygons are connected for Kigali and Bugesera within the published service extents."
      }
    });
  }

  // Start the server-to-server fallback in parallel with the cadastral source.
  // Waiting for the Vercel fallback and then starting GIS queries serially added
  // two separate timeout windows and left Bugesera with no outlines at close zoom.
  const fastFallbackPromise = allowVercelFallback
    ? fetchVercelParcelFallback(bounds, sourceFilter, [], true)
    : Promise.resolve<ParcelFallbackOutcome | null>(null);

  const parcelBudget = { remaining: 900 };
  const results = [];
  for (const provider of providers) {
    if (parcelBudget.remaining <= 0) break;
    const result = await queryParcelBounds(provider, bounds, 0, parcelBudget);
    results.push({ provider, upstreamFeatures: result.features, failed: result.failed });
  }

  if (results.every((result) => result.failed)) {
    const unavailableProviders = results.map((result) => result.provider.id);
    const fallback = await fastFallbackPromise ?? await fetchVercelParcelFallback(
      bounds,
      sourceFilter,
      unavailableProviders,
      allowVercelFallback
    );
    if (fallback.response) return fallback.response;

    return NextResponse.json(
      {
        error: "The cadastral parcel boundary sources are temporarily unavailable.",
        unavailableProviders,
        fallbackStatus: fallback.status,
        fallbackReason: fallback.reason ?? null
      },
      {
        status: 502,
        headers: {
          "Cache-Control": "no-store",
          "X-Parcel-Provider-Warning": "Unavailable provider(s): " + unavailableProviders.join(", "),
          "X-Parcel-Fallback-Status": fallback.status,
          "X-Parcel-Fallback-Reason": fallback.reason ?? "none"
        }
      }
    );
  }

  const features = results.flatMap(({ provider, upstreamFeatures }) =>
    upstreamFeatures.map((feature, index) => {
      const attributes = feature.attributes ?? feature.properties ?? {};
      const upi = textValue(attributeValue(attributes, ["upi"]));
      const geometry = arcGisPolygonToGeoJson(feature.geometry);
      if (!upi || !geometry) return null;

      if (provider.id === "bugesera") {
        const district = textValue(attributeValue(attributes, ["district"]));
        const districtKey = (district ?? "")
          .normalize("NFD")
          .replace(/[\\u0300-\\u036f]/g, "")
          .trim()
          .replace(/\\s+/g, " ")
          .toLocaleLowerCase("en")
          .replace(/\\s+district$/, "");
        if (districtKey !== "bugesera") return null;

        const locationIds = bugeseraLocationIdsFromUpi(upi);
        const rawProvince = textValue(attributeValue(attributes, ["province"]));
        const parcelNumber =
          textValue(attributeValue(attributes, ["parcel_number", "parcelnumber"])) ??
          upi.split("/").at(-1) ??
          null;

        return {
          type: "Feature" as const,
          id: `parcel-bugesera-${upi ?? index}`,
          geometry,
          properties: {
            province: rawProvince === "Eastern" ? "Eastern Province" : rawProvince ?? "Eastern Province",
            province_id: locationIds.provinceId,
            district,
            district_id: locationIds.districtId,
            sector: textValue(attributeValue(attributes, ["sector"])),
            sector_id: locationIds.sectorId,
            cell: textValue(attributeValue(attributes, ["cell"])),
            cell_id: locationIds.cellId,
            village: textValue(attributeValue(attributes, ["village"])),
            // Village codes are not embedded in UPI. MapView joins this name
            // to the authoritative village polygon by cell ID + exact name.
            village_id: null,
            upi,
            parcel_number: parcelNumber,
            parcel_size_m2: numberValue(attributeValue(attributes, ["size"])),
            wetland_area_m2: numberValue(attributeValue(attributes, ["area_in_wetland"])),
            last_updated_on: numberValue(attributeValue(attributes, ["last_updated_on"])),
            source_type: "cadastral-parcel",
            source_label: "National Land Authority · LAIS Bugesera_Parcels FeatureServer (source last edited 23 Oct 2026; reuse permission pending)"
          }
        };
      }

      const parcelNumber = textValue(attributeValue(attributes, ["parcel_number", "parcelnumber"]));
      const district = textValue(attributeValue(attributes, ["district", "district_name"]));
      if (!district || !KIGALI_DISTRICTS.includes(district.toUpperCase() as (typeof KIGALI_DISTRICTS)[number])) {
        return null;
      }

      const objectId = textValue(attributeValue(attributes, ["objectid", "fid", "id"]));
      return {
        type: "Feature" as const,
        id: `parcel-kigali-${objectId ?? upi ?? parcelNumber ?? index}`,
        geometry,
        properties: {
          province: textValue(attributeValue(attributes, ["province"])) ?? "Kigali City",
          province_id: null,
          district,
          district_id: null,
          sector: textValue(attributeValue(attributes, ["sector"])),
          sector_id: null,
          cell: textValue(attributeValue(attributes, ["cell"])),
          cell_id: null,
          village: textValue(attributeValue(attributes, ["village"])),
          village_id: null,
          upi,
          parcel_number: parcelNumber,
          parcel_size_m2: numberValue(attributeValue(attributes, ["size"])),
          wetland_area_m2: numberValue(attributeValue(attributes, ["area_in_wetland"])),
          last_updated_on: numberValue(attributeValue(attributes, ["last_updated_on"])),
          source_type: "cadastral-parcel",
          source_label: "City of Kigali Master Plan · Kigali Parcels layer (1 June 2026)"
        }
      };
    }).filter((feature): feature is NonNullable<typeof feature> => feature !== null)
  );

  const failedProviders = results.filter((result) => result.failed).map((result) => result.provider.id);
  if (features.length === 0 && fastFallbackPromise) {
    const fallback = await fastFallbackPromise;
    if (fallback?.response) return fallback.response;
  }
  return NextResponse.json(
    { type: "FeatureCollection", features },
    {
      headers: {
        "Cache-Control": "public, max-age=0, s-maxage=180, stale-while-revalidate=900",
        "X-Data-Source": "City of Kigali Master Plan parcels; National Land Authority LAIS Bugesera_Parcels",
        "X-Parcel-Coverage": "Kigali and Bugesera parcel polygons queried for this viewport",
        "X-Parcel-Provider-Warning": failedProviders.length
          ? `Some parcel source(s) unavailable: ${failedProviders.join(", ")}`
          : "Bugesera source reuse terms, completeness, and current survey accuracy still need confirmation",
        "X-Parcel-Record-Fields": "UPI, parcel number, area, wetland overlap, last update, and administrative names where exposed",
        "X-Parcel-Request-Budget": "900 full-geometry parcel records maximum per viewport request",
        "X-Parcel-Request-Budget-Reached": parcelBudget.remaining <= 0 ? "true" : "false"
      }
    }
  );
}

export async function GET(request: NextRequest) {
  const rawLevel = request.nextUrl.searchParams.get("level");
  const validLevels = ["district", "sector", "cell", "village", "parcel"] as const;
  if (!validLevels.includes(rawLevel as (typeof validLevels)[number])) {
    return NextResponse.json(
      { error: "level must be district, sector, cell, village, or parcel" },
      { status: 400 }
    );
  }

  const level = rawLevel as (typeof validLevels)[number];
  const rawSource = request.nextUrl.searchParams.get("source");
  if (rawSource && rawSource !== "kigali" && rawSource !== "bugesera") {
    return NextResponse.json(
      { error: "source must be kigali or bugesera" },
      { status: 400 }
    );
  }
  const sourceFilter = rawSource as "kigali" | "bugesera" | null;
  const hasBounds = request.nextUrl.searchParams.has("bbox");
  const bounds = parseBounds(request.nextUrl.searchParams.get("bbox"));
  if (!bounds) {
    if (hasBounds) {
      return NextResponse.json(emptyCollection(), {
        headers: {
          "Cache-Control": "public, max-age=60",
          "X-Data-Source": level === "parcel"
            ? "City of Kigali Master Plan Kigali Parcels FeatureServer"
            : "Kigali City Master Plan and Bugesera Masterplan GIS"
        }
      });
    }

    return NextResponse.json(
      { error: "bbox must be west,south,east,north in WGS84 coordinates" },
      { status: 400 }
    );
  }

  const requestHost = request.nextUrl.hostname.toLowerCase();
  const allowVercelParcelFallback =
    process.env.DEPLOYMENT_PLATFORM === "cloudflare-workers" ||
    requestHost.endsWith(".workers.dev");

  if (level === "parcel") {
    return getParcels(bounds, sourceFilter ?? undefined, allowVercelParcelFallback);
  }
  return getAdministrativeAreas(level, bounds, sourceFilter ?? undefined);
}
