import { NextRequest, NextResponse } from "next/server";
import {
  createRejaReadOnlyDatabase,
  verifyRejaReadOnlyRole
} from "@/lib/reja-database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function positiveInteger(value: string | null, fallback: number, maximum: number): number | null {
  if (value === null || value.trim() === "") return fallback;
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= maximum ? parsed : null;
}

function unavailable(code: string, message: string, status = 503) {
  return NextResponse.json(
    { ok: false, error: code, message },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

/**
 * Public, first-party inventory. PostgreSQL row-level security remains the
 * authority for visibility; this route only returns published, unexpired rows.
 * It never exposes seller IDs, authorization evidence or moderation notes.
 */
export async function GET(request: NextRequest) {
  const database = createRejaReadOnlyDatabase();
  if (!database) {
    return unavailable(
      "EXCHANGE_DATABASE_NOT_CONFIGURED",
      "The authorized exchange database is not connected. No Taiseel listings are being assumed."
    );
  }

  const params = request.nextUrl.searchParams;
  const type = params.get("type") ?? "all";
  const page = positiveInteger(params.get("page"), 1, 100_000);
  const pageSize = positiveInteger(params.get("pageSize"), 24, 100);

  if (!["all", "sale", "rent"].includes(type)) {
    return unavailable("INVALID_LISTING_TYPE", "type must be all, sale or rent.", 400);
  }
  if (page === null || pageSize === null) {
    return unavailable("INVALID_PAGINATION", "page must be positive; pageSize must be from 1 to 100.", 400);
  }

  const listingType = type === "all" ? null : type;
  const offset = (page - 1) * pageSize;

  try {
    if (!(await verifyRejaReadOnlyRole(database))) {
      return unavailable(
        "LISTING_READ_ROLE_UNSAFE",
        "The listing API requires a non-privileged read-only database role."
      );
    }

    const [countRows, listingRows] = await Promise.all([
      database`
        SELECT count(*)::integer AS total
        FROM reja.exchange_listings l
        WHERE l.publication_status = 'published'
          AND (l.expires_at IS NULL OR l.expires_at > now())
          AND reja.has_verified_listing_authorization(
            l.listing_authorization_id,
            l.market_property_id,
            l.seller_user_id,
            l.seller_organization_id
          )
          AND (${listingType}::text IS NULL OR l.listing_type = ${listingType})
      `,
      database`
        SELECT
          l.id::text AS id,
          l.listing_reference AS "listingReference",
          l.listing_type AS "listingType",
          l.asking_amount::text AS "askingAmount",
          l.currency,
          l.rent_period AS "rentPeriod",
          l.publication_status AS "publicationStatus",
          l.published_at AS "publishedAt",
          l.expires_at AS "expiresAt",
          l.updated_at AS "updatedAt",
          p.property_type AS "propertyType",
          p.district_label AS district,
          p.sector_label AS sector,
          p.cell_label AS cell,
          p.address_label AS address,
          p.project_name AS "projectName",
          p.building_name AS "buildingName",
          p.unit_label AS "unitLabel",
          p.bedrooms,
          p.bathrooms::text AS bathrooms,
          p.internal_area_sqm::text AS "internalAreaSqm",
          p.plot_area_sqm::text AS "plotAreaSqm",
          p.latitude::text AS latitude,
          p.longitude::text AS longitude
        FROM reja.exchange_listings l
        JOIN reja.market_properties p
          ON p.id = l.market_property_id AND p.is_current = true
        WHERE l.publication_status = 'published'
          AND (l.expires_at IS NULL OR l.expires_at > now())
          AND reja.has_verified_listing_authorization(
            l.listing_authorization_id,
            l.market_property_id,
            l.seller_user_id,
            l.seller_organization_id
          )
          AND (${listingType}::text IS NULL OR l.listing_type = ${listingType})
        ORDER BY l.published_at DESC NULLS LAST, l.id DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `
    ]);

    const total = Number(countRows[0]?.total ?? 0);
    return NextResponse.json(
      {
        ok: true,
        dataStatus: total > 0 ? "available" : "no_published_listings",
        note: total > 0
          ? null
          : "There are no published, unexpired Taiseel listings in this database. This does not describe the wider property market.",
        rows: listingRows,
        page,
        pageSize,
        total,
        pages: Math.ceil(total / pageSize),
        filters: { type },
        inventoryKind: "first_party_taiseel"
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error(
      "[market:exchange-listings] Read failed",
      error instanceof Error ? error.name : "UnknownError"
    );
    return unavailable(
      "EXCHANGE_LISTINGS_UNAVAILABLE",
      "Published Taiseel listings could not be read."
    );
  }
}
