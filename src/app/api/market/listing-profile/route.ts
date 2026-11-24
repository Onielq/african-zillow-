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

function validSourceKey(value: string | null): string | null {
  const normalized = value?.trim();
  return normalized && /^[a-z0-9][a-z0-9._-]{0,99}$/i.test(normalized)
    ? normalized
    : null;
}

function validListingId(value: string | null): string | null {
  const normalized = value?.trim();
  if (!normalized || normalized.length > 200) return null;
  if (/[\u0000-\u001f\u007f]/.test(normalized)) return null;
  return normalized;
}

/**
 * Resolves one source-specific listing ID to its listing record and any
 * independently verified UPI relationships. Pending or disputed links are
 * deliberately not returned. Location or geometry is never used for matching.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const sourceKey = validSourceKey(params.get("sourceKey"));
  const sourceListingId = validListingId(params.get("listingId"));

  if (!sourceKey) {
    return unavailable("INVALID_LISTING_SOURCE", "sourceKey must be a valid source key.", 400);
  }
  if (!sourceListingId) {
    return unavailable("INVALID_LISTING_ID", "listingId must contain 1 to 200 safe characters.", 400);
  }

  const database = createRejaReadOnlyDatabase();
  if (!database) {
    return unavailable(
      "LISTING_PROFILE_NOT_CONFIGURED",
      "Listing identity lookup is not connected in this environment. No parcel match is being inferred."
    );
  }

  try {
    if (!(await verifyRejaReadOnlyRole(database))) {
      return unavailable(
        "LISTING_READ_ROLE_UNSAFE",
        "Listing identity lookup requires the non-privileged read-only database role."
      );
    }

    const listingRows = await database`
      SELECT
        l.id::text AS "recordId",
        l.source_record_key AS "sourceListingId",
        s.source_key AS "sourceKey",
        s.title AS "sourceTitle",
        s.publisher AS "sourcePublisher",
        s.source_url AS "sourceUrl",
        s.attribution_required AS "attributionRequired",
        l.listing_type AS "listingType",
        l.asking_amount::text AS "askingAmount",
        l.currency,
        l.rent_period AS "rentPeriod",
        l.property_type AS "propertyType",
        l.district_label AS district,
        l.sector_label AS sector,
        l.property_area_sqm::text AS "propertyAreaSqm",
        l.listing_url AS "listingUrl",
        l.listing_status AS "sourceReportedStatus",
        l.first_seen_at AS "firstSeenAt",
        l.last_seen_at AS "lastSeenAt",
        p.cell_label AS cell,
        p.address_label AS address,
        p.project_name AS "projectName",
        p.building_name AS "buildingName",
        p.unit_label AS "unitLabel",
        p.bedrooms,
        p.bathrooms::text AS bathrooms,
        p.internal_area_sqm::text AS "internalAreaSqm",
        p.plot_area_sqm::text AS "plotAreaSqm"
      FROM reja.market_listings l
      JOIN reja.sources s ON s.id = l.source_id
      LEFT JOIN reja.market_properties p
        ON p.id = l.property_id AND p.is_current = true
      WHERE lower(s.source_key) = lower(${sourceKey})
        AND l.source_record_key = ${sourceListingId}
        AND l.is_current = true
        AND s.is_current = true
        AND s.license_status = 'permitted'
        AND s.commercial_use_allowed IS TRUE
        AND s.redistribution_allowed IS TRUE
        AND s.caching_allowed IS TRUE
      LIMIT 1
    `;

    const listing = listingRows[0];
    if (!listing) {
      return unavailable(
        "LISTING_NOT_FOUND",
        "No current listing with public reuse permission matches that source key and listing ID.",
        404
      );
    }

    const parcelLinks = await database`
      SELECT
        p.upi,
        p.parcel_number AS "parcelNumber",
        p.area_sqm::text AS "parcelAreaSqm",
        p.record_status AS "parcelRecordStatus",
        link.relationship_role AS "relationshipRole",
        link.evidence_type AS "evidenceType",
        link.reviewed_at AS "reviewedAt"
      FROM reja.market_listing_parcel_links link
      JOIN reja.parcels p ON p.id = link.parcel_id
      WHERE link.listing_id = ${listing.recordId}::bigint
        AND link.is_current = true
        AND link.claim_status = 'verified'
        AND link.reviewed_by_user_id IS NOT NULL
        AND link.reviewed_at IS NOT NULL
        AND link.reviewed_by_user_id <> link.submitted_by_user_id
        AND p.upi IS NOT NULL
      ORDER BY
        CASE link.relationship_role
          WHEN 'primary_site' THEN 0
          WHEN 'phase' THEN 1
          WHEN 'adjacent' THEN 2
          WHEN 'access' THEN 3
          ELSE 4
        END,
        p.upi ASC
    `;

    const publicListing = Object.fromEntries(
      Object.entries(listing).filter(([key]) => key !== "recordId")
    );

    return NextResponse.json(
      {
        ok: true,
        dataStatus: "available",
        linkStatus: parcelLinks.length === 0
          ? "no_verified_link"
          : parcelLinks.length === 1
            ? "verified"
            : "multiple_verified_links",
        listing: publicListing,
        parcelLinks,
        note: parcelLinks.length === 0
          ? "The listing is available as a source record, but no independently verified parcel link was found. It remains separate; no location-based match is inferred."
          : parcelLinks.length === 1
            ? "The listing has one current, independently reviewed parcel link. Confirm the displayed source evidence before making a decision."
            : "The listing has multiple current, independently reviewed parcel links. Choose the parcel that matches the advertised property; no single parcel is selected automatically."
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error(
      "[market:listing-profile] Read failed",
      error instanceof Error ? error.name : "UnknownError"
    );
    return unavailable(
      "LISTING_PROFILE_UNAVAILABLE",
      "The listing profile could not be read. No parcel association is inferred."
    );
  }
}
