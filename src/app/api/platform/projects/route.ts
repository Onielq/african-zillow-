import { NextRequest, NextResponse } from "next/server";
import { getRejaReadClient, getPageRequest, queryReadRows, platformErrorResponse } from "@/lib/reja-read-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProjectRow = {
  id: string;
  name: string;
  project_type: string;
  lifecycle_state: string;
  description: string | null;
  planned_units: number | null;
  expected_start_date: string | null;
  expected_completion_date: string | null;
  actual_completion_date: string | null;
  developer_name: string;
  district_name: string | null;
  updated_at: string;
};

export async function GET(request: NextRequest) {
  const sql = getRejaReadClient();
  if (!sql) return platformErrorResponse();
  const page = getPageRequest(request);

  try {
    const rows = await queryReadRows<ProjectRow>(
      sql,
      "SELECT p.id, p.name, p.project_type, p.lifecycle_state, p.description, p.planned_units, p.expected_start_date, p.expected_completion_date, p.actual_completion_date, o.display_name AS developer_name, g.official_name AS district_name, p.updated_at FROM reja.development_projects p JOIN reja.organizations o ON o.id = p.developer_organization_id AND o.is_active = true AND o.verification_state = 'verified' LEFT JOIN reja.geographic_areas g ON g.id = p.district_area_id WHERE p.verification_state = 'verified' ORDER BY p.updated_at DESC, lower(p.name) LIMIT $1 OFFSET $2",
      [page.limit + 1, page.offset]
    );
    const items = rows.slice(0, page.limit).map((row) => ({
      id: row.id,
      name: row.name,
      projectType: row.project_type,
      lifecycleState: row.lifecycle_state,
      description: row.description,
      plannedUnits: row.planned_units,
      expectedStartDate: row.expected_start_date,
      expectedCompletionDate: row.expected_completion_date,
      actualCompletionDate: row.actual_completion_date,
      developer: row.developer_name,
      district: row.district_name,
      updatedAt: row.updated_at
    }));
    return NextResponse.json(
      { items, pagination: { ...page, hasMore: rows.length > page.limit } },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return platformErrorResponse();
  }
}
