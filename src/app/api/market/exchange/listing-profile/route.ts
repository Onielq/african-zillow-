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

function validListingReference(value: string | null): string | null {
  const normalized = value?.trim();
  if (!normalized || normalized.length > 120) return null;
  if (/[\u0000-\u001f\u007f]/.test(normalized)) return null;
  return normalized;
}

/**
 * Resolves a first-party Taiseel listing reference. Only published, unexpired
 * listings with a currently valid seller authorization are public. The
 * listing-to-parcel relationship must be independently reviewed; a
 * market_properties.parcel_id, address or coordinate is never enough.
 */
export async function GET(request: NextRequest) {
  const listingReference = validListingReference(
    request.nextUrl.searchParams.get("listingReference")
  );

  if (!listingReference) {
    return unavailable(
      "INVALID_EXCHANGE_LISTING_REFERENCE",
      "listingReference must contain 1 to 120 safe characters.",
      400
    );
  }

  const database = createRejaReadOnlyDatabase();
  if (!database) {
    return unavailable(
      "EXCHANGE_LISTING_PROFILE_NOT_CONFIGURED",
      "Taiseel listing identity lookup is not connected in this environment. No parcel match is being inferred."
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
        l.listing_reference AS "listingReference",
        'first_party_taiseel'::text AS "inventoryKind",
        NULL::text AS "sourceListingId",
        NULL::text AS "sourceKey",
        NULL::text AS "sourceTitle",
        NULL::text AS "sourcePublisher",
        NULL::text AS "sourceUrl",
        false AS "attributionRequired",
        l.listing_type AS "listingType",
        l.asking_amount::text AS "askingAmount",
        l.currency,
        l.rent_period AS "rentPeriod",
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
        coalesce(p.internal_area_sqm, p.plot_area_sqm)::text AS "propertyAreaSqm",
        NULL::text AS "listingUrl",
        l.publication_status AS "sourceReportedStatus",
        l.published_at AS "firstSeenAt",
        l.updated_at AS "lastSeenAt"
      FROM reja.exchange_listings l
      JOIN reja.market_properties p
        ON p.id = l.market_property_id AND p.is_current = true
      WHERE l.listing_reference = ${listingReference}
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
        "EXCHANGE_LISTING_NOT_FOUND",
        "No currently published Taiseel listing with valid seller authorization matches that reference.",
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
      FROM reja.exchange_listing_parcel_links link
      JOIN reja.parcels p ON p.id = link.parcel_id
      WHERE link.exchange_listing_id = ${listing.recordId}::bigint
        AND link.is_current = true
        AND link.claim_status = 'verified'
        AND link.relationship_role = 'primary_site'
        AND link.reviewed_by_user_id IS NOT NULL
        AND link.reviewed_at IS NOT NULL
        AND link.reviewed_by_user_id <> link.submitted_by_user_id
        AND p.upi IS NOT NULL
      ORDER BY p.upi ASC
    `;

    const publicListing = Object.fromEntries(
      Object.entries(listing).filter(([key]) => key !== "recordId")
    );

    return NextResponse.json(
      {
        ok: true,
        dataStatus: "available",
        linkStatus: parcelLinks.length === 0
          ? "no_verified_primary_site_link"
          : parcelLinks.length === 1
            ? "verified"
            : "multiple_verified_links",
        listing: publicListing,
        parcelLinks,
        note: parcelLinks.length === 0
          ? "The Taiseel listing is published and seller-authorized, but no independently verified primary-site parcel link was found. It remains a separate market record; no location-based match is inferred."
          : parcelLinks.length === 1
            ? "The Taiseel listing has one current, independently reviewed primary-site parcel link. Confirm the parcel evidence before making a decision."
            : "The listing has multiple independently reviewed primary-site links. Choose the parcel that matches the advertised property; none is selected automatically."
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error(
      "[market:exchange-listing-profile] Read failed",
      error instanceof Error ? error.name : "UnknownError"
    );
    return unavailable(
      "EXCHANGE_LISTING_PROFILE_UNAVAILABLE",
      "The Taiseel listing profile could not be read. No parcel association is inferred."
    );
  }
}
