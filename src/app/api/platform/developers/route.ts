import { NextRequest, NextResponse } from "next/server";
import { getRejaReadClient, getPageRequest, queryReadRows, platformErrorResponse } from "@/lib/reja-read-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DeveloperRow = {
  organization_id: string;
  display_name: string;
  website_url: string | null;
  verified_at: string;
};

export async function GET(request: NextRequest) {
  const sql = getRejaReadClient();
  if (!sql) return platformErrorResponse();
  const page = getPageRequest(request);

  try {
    const rows = await queryReadRows<DeveloperRow>(
      sql,
      "SELECT organization_id, display_name, website_url, verified_at FROM reja.verified_developer_directory ORDER BY lower(display_name) LIMIT $1 OFFSET $2",
      [page.limit + 1, page.offset]
    );
    const items = rows.slice(0, page.limit).map((row) => ({
      id: row.organization_id,
      name: row.display_name,
      website: row.website_url,
      verifiedAt: row.verified_at
    }));
    return NextResponse.json(
      { items, pagination: { ...page, hasMore: rows.length > page.limit } },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return platformErrorResponse();
  }
}
