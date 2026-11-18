import { NextRequest, NextResponse } from "next/server";
import {
  createRejaReadOnlyDatabase,
  verifyRejaReadOnlyRole
} from "@/lib/reja-database";
import {
  buildMarketListingHistory,
  sourceListingStatusLabel
} from "@/lib/market-listing-history.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unavailable(code: string, message: string, status = 503) {
  return NextResponse.json(
    { ok: false, error: code, message },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

/**
 * History for one externally sourced listing. Every observation is attributed
 * to the source; no inferred transfer or legal completion is created here.
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
      "LISTING_FEED_NOT_CONFIGURED",
      "The authorized listing database is not connected. Listing history is unavailable."
    );
  }

  try {
    if (!(await verifyRejaReadOnlyRole(database))) {
      return unavailable(
        "LISTING_READ_ROLE_UNSAFE",
        "The listing API requires a non-privileged read-only database role."
      );
    }

    const listings = await database`
      SELECT
        l.id::text AS id,
        l.listing_type AS "listingType",
        l.asking_amount::text AS "askingAmount",
        l.currency,
        l.rent_period AS "rentPeriod",
        l.property_type AS "propertyType",
        l.district_label AS district,
        l.sector_label AS sector,
        l.property_area_sqm::text AS "propertyAreaSqm",
        l.listing_status AS "sourceReportedStatus",
        l.first_seen_at AS "firstSeenAt",
        l.last_seen_at AS "lastSeenAt",
        s.title AS "sourceTitle",
        s.publisher AS "sourcePublisher",
        s.source_url AS "sourceUrl"
      FROM reja.market_listings l
      JOIN reja.sources s ON s.id = l.source_id
      WHERE l.id = ${id}::bigint
        AND l.is_current = true
        AND s.is_current = true
        AND s.license_status = 'permitted'
        AND s.commercial_use_allowed IS TRUE
        AND s.redistribution_allowed IS TRUE
        AND s.caching_allowed IS TRUE
      LIMIT 1
    `;

    const listing = listings[0];
    if (!listing) {
      return unavailable(
        "LISTING_NOT_FOUND",
        "No current listing with public reuse permission matches that ID.",
        404
      );
    }

    const observations = await database`
      SELECT
        o.observed_at AS "observedAt",
        o.asking_amount::text AS "askingAmount",
        o.currency,
        o.rent_period AS "rentPeriod",
        o.listing_status AS "listingStatus"
      FROM reja.market_listing_observations o
      JOIN reja.market_listings l ON l.id = o.listing_id
      JOIN reja.sources s ON s.id = l.source_id
      WHERE o.listing_id = ${id}::bigint
        AND l.is_current = true
        AND s.is_current = true
        AND s.license_status = 'permitted'
        AND s.commercial_use_allowed IS TRUE
        AND s.redistribution_allowed IS TRUE
        AND s.caching_allowed IS TRUE
      ORDER BY o.observed_at ASC, o.id ASC
    `;

    const historyInput = observations.map((row) => ({
      observed_at: row.observedAt,
      asking_amount: row.askingAmount,
      currency: row.currency,
      rent_period: row.rentPeriod,
      listing_status: row.listingStatus
    }));

    return NextResponse.json(
      {
        ok: true,
        listing: {
          ...listing,
          statusLabel: sourceListingStatusLabel(listing.sourceReportedStatus),
          statusBasis: "source_reported"
        },
        events: buildMarketListingHistory(historyInput),
        historyBasis: observations.length > 0 ? "source_observations" : "no_observations",
        note: observations.length > 0
          ? "These are source observations. A listing status is not proof of a registered sale, lease, title transfer or ownership change."
          : "No dated source snapshots are recorded for this listing, so no earlier asking-price or availability history is shown. A current asking price cannot establish the original price. A listing status is not proof of a registered sale, lease, title transfer or ownership change."
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error(
      "[market:listing-history] Read failed",
      error instanceof Error ? error.name : "UnknownError"
    );
    return unavailable(
      "LISTING_HISTORY_UNAVAILABLE",
      "The listing history could not be read. No sale or lease outcome is inferred."
    );
  }
}
