import { NextRequest, NextResponse } from "next/server";
import {
  createRejaReadOnlyDatabase,
  verifyRejaReadOnlyRole
} from "@/lib/reja-database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unavailable(code: string, message: string, status = 503) {
  return NextResponse.json(
    { ok: false, error: code, message },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

/**
 * Public event history for a listing that is currently published.
 * RLS controls visibility. Free-text notes, event_data and actor IDs are never
 * returned. A seller-reported sold/leased event is not a registry transfer.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!/^[1-9]\d{0,17}$/.test(id)) {
    return unavailable("INVALID_LISTING_ID", "The listing ID is invalid.", 400);
  }

  const database = createRejaReadOnlyDatabase();
  if (!database) {
    return unavailable(
      "EXCHANGE_DATABASE_NOT_CONFIGURED",
      "The authorized exchange database is not connected. Listing history is unavailable."
    );
  }

  try {
    if (!(await verifyRejaReadOnlyRole(database))) {
      return unavailable(
        "LISTING_READ_ROLE_UNSAFE",
        "The listing API requires a non-privileged read-only database role."
      );
    }

    const listingRows = await database`
      SELECT
        l.id::text AS id,
        l.listing_reference AS "listingReference",
        l.listing_type AS "listingType",
        l.asking_amount::text AS "askingAmount",
        l.currency,
        l.rent_period AS "rentPeriod",
        l.published_at AS "publishedAt",
        l.expires_at AS "expiresAt",
        p.property_type AS "propertyType",
        p.district_label AS district,
        p.sector_label AS sector,
        p.project_name AS "projectName",
        p.building_name AS "buildingName",
        p.unit_label AS "unitLabel"
      FROM reja.exchange_listings l
      JOIN reja.market_properties p
        ON p.id = l.market_property_id AND p.is_current = true
      WHERE l.id = ${id}::bigint
        AND l.publication_status = 'published'
        AND (l.expires_at IS NULL OR l.expires_at > now())
          AND reja.has_verified_listing_authorization(
            l.listing_authorization_id,
            l.market_property_id,
            l.seller_user_id,
            l.seller_organization_id
          )
      LIMIT 1
    `;

    const listing = listingRows[0];
    if (!listing) {
      return unavailable(
        "LISTING_NOT_FOUND",
        "No currently published Taiseel listing matches that ID.",
        404
      );
    }

    const [events, observations] = await Promise.all([
      database`
        SELECT event_type AS "eventType", created_at AS "occurredAt"
        FROM reja.exchange_listing_events
        WHERE listing_id = ${id}::bigint
        ORDER BY created_at ASC, id ASC
      `,
      database`
        SELECT
          observed_at AS "observedAt",
          asking_amount::text AS "askingAmount",
          currency,
          publication_status AS "publicationStatus"
        FROM reja.exchange_listing_observations
        WHERE listing_id = ${id}::bigint
        ORDER BY observed_at ASC, id ASC
      `
    ]);

    return NextResponse.json(
      {
        ok: true,
        listing,
        events,
        priceHistory: observations,
        historyVisibility: "currently_published_listing_only",
        note: "Events are Taiseel workflow records. A seller-reported sold or leased event is not confirmation of a registered transfer. Private history for withdrawn, expired or unpublished listings remains restricted to authorized parties."
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error(
      "[market:exchange-history] Read failed",
      error instanceof Error ? error.name : "UnknownError"
    );
    return unavailable(
      "EXCHANGE_HISTORY_UNAVAILABLE",
      "The published listing history could not be read."
    );
  }
}
