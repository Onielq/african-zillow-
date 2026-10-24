import { NextRequest, NextResponse } from "next/server";
import {
  getMonthlyHistoricalBaseline,
  TRANSACTION_BENCHMARK_SOURCE,
  TRANSACTION_DASHBOARD_SOURCE,
  TRANSACTION_DISTRICT_BENCHMARKS
} from "@/data/transaction-benchmarks";

export const runtime = "nodejs";
export const revalidate = 3600;

const PILOT_DISTRICTS = new Set(["bugesera", "gasabo", "kicukiro", "nyarugenge"]);

const KIGALI_PARCELS =
  "https://masterplan.kigalicity.gov.rw/server/rest/services/Hosted/Kigali_Parcels_1June2026_for_search/FeatureServer/0";
const BUGESERA_PARCELS =
  "https://services7.arcgis.com/htgaiKX6RV2DDGgK/arcgis/rest/services/Bugesera_Parcels/FeatureServer/0";

type ArcGisCountResponse = {
  count?: number;
  error?: { code?: number; message?: string };
};

type GeographyLevel = "district" | "sector" | "cell" | "village";

function sqlString(value: string): string {
  return "'" + value.replace(/'/g, "''") + "'";
}

async function queryParcelCount(layerUrl: string, where: string): Promise<number> {
  const params = new URLSearchParams({
    where,
    returnCountOnly: "true",
    returnGeometry: "false",
    f: "json"
  });
  const response = await fetch(layerUrl + "/query?" + params.toString(), {
    headers: { Accept: "application/json" },
    next: { revalidate: 3600 },
    signal: AbortSignal.timeout(12_000)
  });
  if (!response.ok) throw new Error("Parcel count query failed (" + response.status + ")");
  const payload = await response.json() as ArcGisCountResponse;
  if (payload.error) {
    throw new Error("ArcGIS count error " + (payload.error.code ?? "unknown") + ": " + (payload.error.message ?? "query failed"));
  }
  if (typeof payload.count !== "number" || !Number.isFinite(payload.count)) {
    throw new Error("Parcel count response did not contain a valid count.");
  }
  return payload.count;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const district = params.get("district")?.trim() ?? "";
  const districtKey = district.toLocaleLowerCase("en");
  const level = (params.get("level") ?? "district") as GeographyLevel;
  const sector = params.get("sector")?.trim() ?? "";
  const cell = params.get("cell")?.trim() ?? "";
  const village = params.get("village")?.trim() ?? "";

  if (!PILOT_DISTRICTS.has(districtKey)) {
    return NextResponse.json({ error: "district must be one of the four pilot districts" }, { status: 400 });
  }
  if (!["district", "sector", "cell", "village"].includes(level)) {
    return NextResponse.json({ error: "level must be district, sector, cell, or village" }, { status: 400 });
  }
  if (level === "sector" && !sector) {
    return NextResponse.json({ error: "sector is required for a sector estimate" }, { status: 400 });
  }
  if (level === "cell" && (!sector || !cell)) {
    return NextResponse.json({ error: "sector and cell are required for a cell estimate" }, { status: 400 });
  }
  if (level === "village" && (!sector || !cell || !village)) {
    return NextResponse.json({ error: "sector, cell, and village are required for a village estimate" }, { status: 400 });
  }

  const benchmark = TRANSACTION_DISTRICT_BENCHMARKS[districtKey];
  if (!benchmark) {
    return NextResponse.json({ estimate: null, status: "unavailable", district, level }, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
  }

  const districtBaseline = districtKey === "bugesera" && benchmark.currentMonthReported
    ? benchmark.currentMonthReported.count
    : getMonthlyHistoricalBaseline(district);
  const common = {
    district,
    level,
    unit: "registered land transactions per month",
    annualTransactions2023: benchmark.annualTransactions2023,
    currentMonthReported: districtKey === "bugesera" ? benchmark.currentMonthReported ?? null : null,
    sources: {
      annualBenchmark: TRANSACTION_BENCHMARK_SOURCE,
      dashboard: TRANSACTION_DASHBOARD_SOURCE
    }
  };

  if (level === "district") {
    return NextResponse.json({
      ...common,
      estimate: districtBaseline,
      status: districtKey === "bugesera" ? "reported-current-month-unverified" : "historical-monthly-baseline",
      method: districtKey === "bugesera"
        ? "User-reported month-to-date dashboard reading. An indexed dashboard snapshot separately showed 4,031; this app has not reconciled the live source."
        : "Historical baseline: official 2023 annual land transactions divided by 12. This is not the current month count."
    }, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" }
    });
  }

  const layerUrl = districtKey === "bugesera" ? BUGESERA_PARCELS : KIGALI_PARCELS;
  const districtWhere = "upi IS NOT NULL AND district = " + sqlString(benchmark.district);
  const filters = [districtWhere];
  if (level === "sector" || level === "cell" || level === "village") filters.push("sector = " + sqlString(sector));
  if (level === "cell" || level === "village") filters.push("cell = " + sqlString(cell));
  if (level === "village") filters.push("village = " + sqlString(village));
  const areaWhere = filters.join(" AND ");

  try {
    const [districtParcelCount, areaParcelCount] = await Promise.all([
      queryParcelCount(layerUrl, districtWhere),
      queryParcelCount(layerUrl, areaWhere)
    ]);
    if (districtParcelCount <= 0 || areaParcelCount < 0) {
      throw new Error("No usable parcel-count denominator was returned.");
    }
    const share = Math.min(areaParcelCount, districtParcelCount) / districtParcelCount;
    const estimate = Math.round((districtBaseline ?? 0) * share);
    return NextResponse.json({
      ...common,
      estimate,
      status: "parcel-share-model",
      allocation: {
        method: "district monthly baseline × the selected area's share of returned cadastral parcel records",
        districtParcelCount,
        areaParcelCount,
        estimatedShare: share
      },
      method: "Modelled estimate only, not an official monthly transaction count. It assumes transaction activity is proportional to registered parcel counts; local activity can differ materially."
    }, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" }
    });
  } catch (error) {
    console.error("Transaction-volume allocation unavailable.", error);
    return NextResponse.json({
      ...common,
      estimate: null,
      status: "unavailable",
      method: "A local parcel-count denominator could not be verified, so no subdistrict estimate is shown."
    }, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" }
    });
  }
}
