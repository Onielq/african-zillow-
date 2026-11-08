import { NextRequest, NextResponse } from "next/server";
import { getRejaReadClient, getPageRequest, queryReadRows, platformErrorResponse } from "@/lib/reja-read-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ListingRow = {
  id: string;
  listing_type: string;
  asking_amount: string;
  currency: string;
  rent_period: string;
  property_type: string;
  district_label: string;
  sector_label: string | null;
  property_area_sqm: string | null;
  asking_price_per_sqm: string | null;
  listing_url: string | null;
  first_seen_at: string;
  last_seen_at: string;
  expires_at: string | null;
  organization_name: string;
  project_name: string | null;
  building_name: string | null;
  unit_label: string | null;
  bedrooms: number | null;
  bathrooms: string | null;
  internal_area_sqm: string | null;
  plot_area_sqm: string | null;
};

export async function GET(request: NextRequest) {
  const sql = getRejaReadClient();
  if (!sql) return platformErrorResponse();
  const page = getPageRequest(request);

  try {
    const rows = await queryReadRows<ListingRow>(
      sql,
      "SELECT id, listing_type, asking_amount, currency, rent_period, property_type, district_label, sector_label, property_area_sqm, asking_price_per_sqm, listing_url, first_seen_at, last_seen_at, expires_at, organization_name, project_name, building_name, unit_label, bedrooms, bathrooms, internal_area_sqm, plot_area_sqm FROM reja.public_market_listings ORDER BY first_seen_at DESC, id DESC LIMIT $1 OFFSET $2",
      [page.limit + 1, page.offset]
    );
    const items = rows.slice(0, page.limit).map((row) => ({
      id: row.id,
      listingType: row.listing_type,
      askingAmount: row.asking_amount,
      currency: row.currency.trim(),
      rentPeriod: row.rent_period,
      propertyType: row.property_type,
      district: row.district_label,
      sector: row.sector_label,
      areaSqm: row.property_area_sqm,
      askingPricePerSqm: row.asking_price_per_sqm,
      listingUrl: row.listing_url,
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
      expiresAt: row.expires_at,
      organization: row.organization_name,
      project: row.project_name,
      building: row.building_name,
      unit: row.unit_label,
      bedrooms: row.bedrooms,
      bathrooms: row.bathrooms,
      internalAreaSqm: row.internal_area_sqm,
      plotAreaSqm: row.plot_area_sqm
    }));
    return NextResponse.json(
      { items, pagination: { ...page, hasMore: rows.length > page.limit } },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return platformErrorResponse();
  }
}
