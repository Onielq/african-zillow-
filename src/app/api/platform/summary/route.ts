import { NextResponse } from "next/server";
import { getRejaReadClient, queryReadRows, platformErrorResponse } from "@/lib/reja-read-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PlatformCounts = {
  administrative_area_count: string;
  parcel_record_count: string;
  project_record_count: string;
  unit_record_count: string;
  organization_count: string;
  public_listing_count: string;
  verified_transaction_count: string;
};

export async function GET() {
  const sql = getRejaReadClient();
  if (!sql) return platformErrorResponse();

  try {
    const rows = await queryReadRows<PlatformCounts>(
      sql,
      "SELECT administrative_area_count, parcel_record_count, project_record_count, unit_record_count, organization_count, public_listing_count, verified_transaction_count FROM reja.platform_data_counts"
    );
    if (!rows[0]) return platformErrorResponse();
    return NextResponse.json(
      { counts: rows[0] },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return platformErrorResponse();
  }
}
