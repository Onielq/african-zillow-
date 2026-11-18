import { NextRequest, NextResponse } from "next/server";
import { createRejaReadOnlyDatabase } from "@/lib/reja-database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROPERTY_TYPES = [
  "apartment",
  "house",
  "land",
  "commercial",
  "industrial",
  "mixed_use",
  "other",
  "unknown"
] as const;

function positiveInteger(value: string | null, fallback: number, maximum: number): number | null {
  if (value === null || value.trim() === "") return fallback;
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= maximum ? parsed : null;
}

function optionalLabel(value: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, 100) : null;
}

function unavailable(code: string, message: string, status = 503) {
  return NextResponse.json(
    { ok: false, error: code, message },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

/**
 * Public source-observed listings only.
 * A source must explicitly permit commercial use, redistribution and caching.
 * This route never reads first-party exchange inventory or changes listing state.
 * "Active" means the connected source last reported active.
 */
export async function GET(request: NextRequest) {
  const database = createRejaReadOnlyDatabase();
  if (!database) {
    return unavailable(
      "LISTING_FEED_NOT_CONFIGURED",
      "The authorized listing database is not connected. No listing availability is being inferred."
    );
  }

  const params = request.nextUrl.searchParams;
  const type = params.get("type") ?? "all";
  const propertyType = params.get("propertyType") ?? "all";
  const currencyInput = (params.get("currency") ?? "").trim().toUpperCase();
  const district = optionalLabel(params.get("district"));
  const sector = optionalLabel(params.get("sector"));
  const page = positiveInteger(params.get("page"), 1, 100_000);
  const pageSize = positiveInteger(params.get("pageSize"), 24, 100);

  if (!["all", "sale", "rent"].includes(type)) {
    return unavailable("INVALID_LISTING_TYPE", "type must be all, sale or rent.", 400);
  }
  if (propertyType !== "all" && !PROPERTY_TYPES.includes(propertyType as typeof PROPERTY_TYPES[number])) {
    return unavailable("INVALID_PROPERTY_TYPE", "propertyType is not supported.", 400);
  }
  if (currencyInput && !/^[A-Z]{3}$/.test(currencyInput)) {
    return unavailable("INVALID_CURRENCY", "currency must be a three-letter currency code.", 400);
  }
  if (page === null || pageSize === null) {
    return unavailable("INVALID_PAGINATION", "page must be positive; pageSize must be from 1 to 100.", 400);
  }

  const currency = currencyInput || null;
  const listingType = type === "all" ? null : type;
  const selectedPropertyType = propertyType === "all" ? null : propertyType;
  const offset = (page - 1) * pageSize;

  try {
    const [countRows, listingRows] = await Promise.all([
      database`
        SELECT count(*)::integer AS total
          FROM reja.market_listings l
          JOIN reja.sources s ON s.id = l.source_id
         WHERE l.is_current = true
           AND l.listing_status = 'active'
           AND s.is_current = true
           AND s.license_status = 'permitted'
           AND s.commercial_use_allowed IS TRUE
           AND s.redistribution_allowed IS TRUE
           AND s.caching_allowed IS TRUE
           AND (${listingType}::text IS NULL OR l.listing_type = ${listingType})
           AND (${selectedPropertyType}::text IS NULL OR l.property_type = ${selectedPropertyType})
           AND (${currency}::text IS NULL OR l.currency = ${currency})
           AND (${district}::text IS NULL OR lower(l.district_label) = lower(${district}))
           AND (${sector}::text IS NULL OR lower(coalesce(l.sector_label, '')) = lower(${sector}))
      `,
      database`
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
          l.asking_price_per_sqm::text AS "askingPricePerSqm",
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
          p.plot_area_sqm::text AS "plotAreaSqm",
          s.title AS "sourceTitle",
          s.publisher AS "sourcePublisher",
          s.source_url AS "sourceUrl",
          s.attribution_required AS "attributionRequired"
        FROM reja.market_listings l
        JOIN reja.sources s ON s.id = l.source_id
        LEFT JOIN reja.market_properties p
          ON p.id = l.property_id AND p.is_current = true
        WHERE l.is_current = true
          AND l.listing_status = 'active'
          AND s.is_current = true
          AND s.license_status = 'permitted'
          AND s.commercial_use_allowed IS TRUE
          AND s.redistribution_allowed IS TRUE
          AND s.caching_allowed IS TRUE
          AND (${listingType}::text IS NULL OR l.listing_type = ${listingType})
          AND (${selectedPropertyType}::text IS NULL OR l.property_type = ${selectedPropertyType})
          AND (${currency}::text IS NULL OR l.currency = ${currency})
          AND (${district}::text IS NULL OR lower(l.district_label) = lower(${district}))
          AND (${sector}::text IS NULL OR lower(coalesce(l.sector_label, '')) = lower(${sector}))
        ORDER BY l.last_seen_at DESC, l.id DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `
    ]);

    const total = Number(countRows[0]?.total ?? 0);
    return NextResponse.json(
      {
        ok: true,
        dataStatus: total > 0 ? "available" : "no_eligible_records",
        note: total > 0
          ? null
          : "No source-authorized current listings were found for these filters. This does not mean no properties are available.",
        rows: listingRows,
        page,
        pageSize,
        total,
        pages: Math.ceil(total / pageSize),
        filters: { type, propertyType, currency, district, sector },
        statusBasis: "source_reported"
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    // Provider messages can include SQL or connection details; keep them server-side.
    console.error(
      "[market:listings] Read failed",
      error instanceof Error ? error.name : "UnknownError"
    );
    return unavailable(
      "LISTING_FEED_UNAVAILABLE",
      "The authorized listing feed could not be read. Listing availability remains unconfirmed."
    );
  }
}
