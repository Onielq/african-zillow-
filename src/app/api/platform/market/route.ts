import { NextRequest, NextResponse } from "next/server";
import { getRejaReadClient, getPageRequest, queryReadRows, platformErrorResponse } from "@/lib/reja-read-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MarketMetricRow = {
  month_start: string;
  district_label: string;
  sector_label: string;
  property_type: string;
  transaction_type: string;
  currency: string;
  rent_period: string;
  transaction_count: number;
  distinct_property_count: number;
  median_amount: string | null;
  median_price_per_sqm: string | null;
  median_area_sqm: string | null;
  earliest_transaction_date: string | null;
  latest_transaction_date: string | null;
};

export async function GET(request: NextRequest) {
  const sql = getRejaReadClient();
  if (!sql) return platformErrorResponse();
  const page = getPageRequest(request);

  try {
    const rows = await queryReadRows<MarketMetricRow>(
      sql,
      "SELECT month_start, district_label, sector_label, property_type, transaction_type, currency, rent_period, transaction_count, distinct_property_count, median_amount, median_price_per_sqm, median_area_sqm, earliest_transaction_date, latest_transaction_date FROM reja.market_area_monthly_metrics ORDER BY month_start DESC, lower(district_label), lower(sector_label) LIMIT $1 OFFSET $2",
      [page.limit + 1, page.offset]
    );
    const items = rows.slice(0, page.limit).map((row) => ({
      monthStart: row.month_start,
      district: row.district_label,
      sector: row.sector_label,
      propertyType: row.property_type,
      transactionType: row.transaction_type,
      currency: row.currency.trim(),
      rentPeriod: row.rent_period,
      transactionCount: row.transaction_count,
      distinctPropertyCount: row.distinct_property_count,
      medianAmount: row.median_amount,
      medianPricePerSqm: row.median_price_per_sqm,
      medianAreaSqm: row.median_area_sqm,
      earliestTransactionDate: row.earliest_transaction_date,
      latestTransactionDate: row.latest_transaction_date
    }));
    return NextResponse.json(
      { items, pagination: { ...page, hasMore: rows.length > page.limit } },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return platformErrorResponse();
  }
}
