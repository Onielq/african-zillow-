import { NextRequest, NextResponse } from "next/server";

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
const DISTRICT_AVERAGE_LAND_PRICE_RWF_PER_M2: Record<string, number> = {
  GASABO: 36013,
  KICUKIRO: 61491,
  NYARUGENGE: 50735,
  BUGESERA: 4033
};
const DISTRICT_LAND_PRICE_SOURCE =
  "https://rwandalanddashboard.lands.rw/prices";

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

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

async function queryArcGisLayer(
  layerUrl: string,
  bounds: Bounds,
  resultRecordCount?: number,
  where = "1=1",
  outFields = "*"
): Promise<UpstreamFeature[]> {
  const upstreamUrl = new URL(`${layerUrl}/query`);
  // Request the provider's full polygon geometry. Do not set maxAllowableOffset
  // or geometryPrecision: either can generalize or round parcel boundary vertices.
  const params = new URLSearchParams({
    where,
    geometry: bounds.join(","),
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    outSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields,
    returnGeometry: "true",
    f: "json"
  });

  // Older MapServer layers reject resultRecordCount because they do not
  // support pagination. Leave that parameter off for admin boundaries, and
  // set it only for the newer parcel FeatureServer, which supports pagination.
  if (typeof resultRecordCount === "number") {
    params.set("resultRecordCount", String(resultRecordCount));
  }

  upstreamUrl.search = params.toString();

  const response = await fetch(upstreamUrl, {
    headers: { Accept: "application/json" },
    next: { revalidate: 300 },
    signal: AbortSignal.timeout(15_000)
  });

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
  sourceId: "kigali" | "bugesera"
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
      source_label: sourceId === "kigali"
        ? "Kigali City Master Plan administrative boundaries (April 2026 map service)"
        : level === "cell"
          ? "Bugesera Masterplan GIS · NISR cell boundary metadata lists capture year 2012"
          : "Bugesera Masterplan GIS administrative boundaries (source vintage to confirm)",
      source_type: "administrative-boundary",
      ...(level === "district" &&
      DISTRICT_AVERAGE_LAND_PRICE_RWF_PER_M2[upperDistrict] !== undefined
        ? {
            average_land_price_per_m2:
              DISTRICT_AVERAGE_LAND_PRICE_RWF_PER_M2[upperDistrict],
            average_land_price_source: DISTRICT_LAND_PRICE_SOURCE,
            average_land_price_date_status: "source observation date not exposed"
          }
        : {})
    }
  };
}

async function getAdministrativeAreas(
  level: AreaLevel,
  bounds: Bounds
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
  ].filter((source) => boundsIntersect(bounds, source.extent));

  const results = await Promise.all(sources.map(async (source) => {
    try {
      const upstreamFeatures = await queryArcGisLayer(
        `${source.baseUrl}/${source.layerId}`,
        bounds
      );
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

  const features = results
    .flatMap((result) => result.features.map((feature) =>
      normaliseAdministrativeFeature(feature, level, result.sourceId)
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
        "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=1800",
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

async function getParcels(bounds: Bounds): Promise<NextResponse> {
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

  const results = await Promise.all(providers.map(async (provider) => {
    try {
      // Request only public identification fields. In Bugesera, query only
      // UPI; do not fetch owner or other land-management attributes.
      const upstreamFeatures = await queryArcGisLayer(
        provider.layerUrl,
        bounds,
        2000,
        "upi IS NOT NULL",
        provider.id === "bugesera"
          ? "upi"
          : "upi,province,district,sector,cell,village,parcel_number,size,area_in_wetland,last_updated_on"
      );
      return { provider, upstreamFeatures, failed: false };
    } catch (error) {
      console.error(`Cadastral parcel GIS request failed for ${provider.id}.`, error);
      return { provider, upstreamFeatures: [] as UpstreamFeature[], failed: true };
    }
  }));

  if (results.every((result) => result.failed)) {
    return NextResponse.json(
      { error: "The cadastral parcel boundary sources are temporarily unavailable." },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }

  const features = results.flatMap(({ provider, upstreamFeatures }) =>
    upstreamFeatures.map((feature, index) => {
      const attributes = feature.attributes ?? feature.properties ?? {};
      const upi = textValue(attributeValue(attributes, ["upi"]));
      const geometry = arcGisPolygonToGeoJson(feature.geometry);
      if (!upi || !geometry) return null;

      if (provider.id === "bugesera") {
        // Small public polygon samples and UPI were found for this NLA-hosted
        // LAIS layer. Reuse terms, completeness and live survey currency still
        // need confirmation, so return only polygon geometry plus the UPI.
        return {
          type: "Feature" as const,
          id: `parcel-bugesera-${upi ?? index}`,
          geometry,
          properties: {
            province: "Eastern Province",
            province_id: null,
            district: "Bugesera",
            district_id: null,
            sector: null,
            sector_id: null,
            cell: null,
            cell_id: null,
            village: null,
            village_id: null,
            upi,
            parcel_number: null,
            parcel_size_m2: null,
            wetland_area_m2: null,
            last_updated_on: null,
            source_type: "cadastral-parcel",
            source_label: "National Land Authority · LAIS Bugesera_Parcels FeatureServer (reuse terms and completeness to confirm)"
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
        "X-Parcel-Record-Fields": "UPI; Kigali additionally exposes parcel number, area, wetland overlap, and last update"
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

  if (level === "parcel") return getParcels(bounds);
  return getAdministrativeAreas(level, bounds);
}
