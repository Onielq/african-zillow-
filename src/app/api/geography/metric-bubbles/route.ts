import { NextRequest, NextResponse } from "next/server";
import {
  getMonthlyHistoricalBaseline,
  TRANSACTION_DISTRICT_BENCHMARKS
} from "@/data/transaction-benchmarks";

export const runtime = "nodejs";
export const revalidate = 3600;

const KIGALI_PARCELS =
  "https://masterplan.kigalicity.gov.rw/server/rest/services/Hosted/Kigali_Parcels_1June2026_for_search/FeatureServer/0";
const BUGESERA_PARCELS =
  "https://services7.arcgis.com/htgaiKX6RV2DDGgK/arcgis/rest/services/Bugesera_Parcels/FeatureServer/0";

type Level = "district" | "sector" | "cell" | "village";
type GroupFeature = { attributes?: Record<string, unknown> };
type QueryResponse = {
  count?: number;
  features?: GroupFeature[];
  error?: { code?: number; message?: string };
};
type GroupValue = {
  level: Level;
  district: string;
  sector: string | null;
  cell: string | null;
  village: string | null;
  estimate: number;
  label: string;
  status: "historical-monthly-baseline" | "reported-current-month-unverified" | "parcel-share-model";
  method: string;
};

const DISTRICTS = [
  { district: "Gasabo", layerUrl: KIGALI_PARCELS },
  { district: "Kicukiro", layerUrl: KIGALI_PARCELS },
  { district: "Nyarugenge", layerUrl: KIGALI_PARCELS },
  { district: "Bugesera", layerUrl: BUGESERA_PARCELS }
] as const;

const GROUP_FIELDS: Record<Exclude<Level, "district">, string[]> = {
  sector: ["sector"],
  cell: ["sector", "cell"],
  village: ["sector", "cell", "village"]
};

function sqlString(value: string): string {
  return "'" + value.replace(/'/g, "''") + "'";
}

function normalized(value: unknown): string {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

function readAttribute(attributes: Record<string, unknown>, name: string): string | null {
  const target = normalized(name).replace(/[^a-z0-9]/g, "");
  const entry = Object.entries(attributes).find(([key]) =>
    normalized(key).replace(/[^a-z0-9]/g, "") === target
  );
  return entry?.[1] === null || entry?.[1] === undefined || String(entry[1]).trim() === ""
    ? null
    : String(entry[1]).trim();
}

async function query(layerUrl: string, parameters: Record<string, string>): Promise<QueryResponse> {
  const url = new URL(layerUrl + "/query");
  url.search = new URLSearchParams({ ...parameters, f: "json" }).toString();
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: 3600 },
    signal: AbortSignal.timeout(15_000)
  });
  if (!response.ok) throw new Error("Cadastral metric request failed (" + response.status + ")");
  const payload = await response.json() as QueryResponse;
  if (payload.error) {
    throw new Error("ArcGIS " + (payload.error.code ?? "error") + ": " + (payload.error.message ?? "query failed"));
  }
  return payload;
}

function districtMonthlyBaseline(district: string): {
  value: number;
  status: GroupValue["status"];
  method: string;
} {
  if (normalized(district) === "bugesera") {
    return {
      value: 4350,
      status: "reported-current-month-unverified",
      method: "User-reported Bugesera month-to-date figure observed 24 Oct 2026; the dashboard snapshot has not been reconciled."
    };
  }
  return {
    value: getMonthlyHistoricalBaseline(district) ?? 0,
    status: "historical-monthly-baseline",
    method: "NISR 2023 annual district transactions divided by 12. Historical baseline, not a live monthly count."
  };
}

function compact(value: number): string {
  if (value >= 1000) return (value / 1000).toFixed(value >= 10000 ? 0 : 1) + "k";
  if (value >= 100) return Math.round(value).toLocaleString("en-RW");
  return value.toFixed(value < 10 && value % 1 !== 0 ? 1 : 0);
}

async function countDistrict(layerUrl: string, district: string): Promise<number> {
  const payload = await query(layerUrl, {
    where: "upi IS NOT NULL AND district = " + sqlString(district),
    returnCountOnly: "true",
    returnGeometry: "false"
  });
  if (typeof payload.count !== "number" || !Number.isFinite(payload.count)) {
    throw new Error("The cadastral source did not return a valid district parcel count.");
  }
  return payload.count;
}

async function countGrouped(
  layerUrl: string,
  district: string,
  level: Exclude<Level, "district">
): Promise<Array<{ sector: string | null; cell: string | null; village: string | null; count: number }>> {
  const fields = GROUP_FIELDS[level];
  const statistics = JSON.stringify([{
    statisticType: "count",
    onStatisticField: "upi",
    outStatisticFieldName: "parcel_count"
  }]);
  const payload = await query(layerUrl, {
    where: "upi IS NOT NULL AND district = " + sqlString(district),
    outFields: fields.join(","),
    groupByFieldsForStatistics: fields.join(","),
    outStatistics: statistics,
    returnGeometry: "false",
    resultRecordCount: "5000",
    orderByFields: fields.map((field) => field + " ASC").join(",")
  });
  return (payload.features ?? []).flatMap((feature) => {
    const attributes = feature.attributes ?? {};
    const count = Number(readAttribute(attributes, "parcel_count"));
    if (!Number.isFinite(count) || count < 0) return [];
    const sector = readAttribute(attributes, "sector");
    const cell = readAttribute(attributes, "cell");
    const village = readAttribute(attributes, "village");
    if (!sector || (level !== "sector" && !cell) || (level === "village" && !village)) return [];
    return [{ sector, cell: level === "sector" ? null : cell, village: level === "village" ? village : null, count }];
  });
}

function key(level: Level, district: string, sector?: string | null, cell?: string | null, village?: string | null): string {
  return [level, normalized(district), normalized(sector), normalized(cell), normalized(village)].join("|");
}

export async function GET(request: NextRequest) {
  const levelParam = request.nextUrl.searchParams.get("level");
  if (levelParam && !["district", "sector", "cell", "village"].includes(levelParam)) {
    return NextResponse.json({ error: "level must be district, sector, cell, or village" }, { status: 400 });
  }

  const output: GroupValue[] = [];
  const failures: string[] = [];
  const districtResults = await Promise.all(DISTRICTS.map(async ({ district, layerUrl }) => {
    const baseline = districtMonthlyBaseline(district);
    output.push({
      level: "district", district, sector: null, cell: null, village: null,
      estimate: baseline.value, label: (baseline.status === "reported-current-month-unverified" ? "*" : "") + compact(baseline.value),
      status: baseline.status, method: baseline.method
    });

    try {
      const total = await countDistrict(layerUrl, district);
      if (total <= 0) return;
      const levels = await Promise.all((["sector", "cell", "village"] as const).map(async (level) => {
        try {
          return { level, groups: await countGrouped(layerUrl, district, level), failed: false as const };
        } catch (error) {
          console.error("Unable to group parcel counts for " + district + " " + level + ".", error);
          failures.push(district + ":" + level);
          return { level, groups: [], failed: true as const };
        }
      }));
      for (const { level, groups } of levels) {
        for (const group of groups) {
          const estimate = Math.max(0, baseline.value * group.count / total);
          const fields = {
            level,
            district,
            sector: group.sector,
            cell: group.cell,
            village: group.village
          };
          output.push({
            ...fields,
            estimate: Math.round(estimate * 10) / 10,
            label: "≈" + compact(estimate),
            status: "parcel-share-model",
            method: "District monthly baseline multiplied by the selected area's share of cadastral parcel records. This is modelled activity, not an official sector/cell/village transaction count."
          });
        }
      }
    } catch (error) {
      console.error("Unable to calculate parcel-share volume for " + district + ".", error);
      failures.push(district + ":district");
    }
  }));

  void districtResults;
  return NextResponse.json({
    metric: "transactionVolume",
    unit: "estimated transactions per month",
    values: output,
    warnings: [
      "Sector, cell and village values are modelled using parcel-count shares, not official transaction counts.",
      "Bugesera's district baseline is a user-reported, unverified 24 Oct 2026 observation."
    ],
    partialFailures: failures
  }, {
    headers: {
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      "X-Metric-Source": "NISR Statistical Yearbook 2025 Table 5.2 plus connected public cadastral parcel counts"
    }
  });
}
