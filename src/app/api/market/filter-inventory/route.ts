import { NextRequest, NextResponse } from "next/server";
import {
  createRejaReadOnlyDatabase,
  verifyRejaReadOnlyRole
} from "@/lib/reja-database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HISTOGRAM_BUCKETS = 24;
const PROPERTY_TYPES = new Set(["apartment", "house", "land", "commercial", "industrial", "mixed_use", "other", "unknown"]);

function json(status: number, data: Record<string, unknown>) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function positiveNumber(value: string | null, maximum: number): number | null {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= maximum ? parsed : Number.NaN;
}

function positiveInteger(value: string | null, maximum: number): number | null {
  if (value === null || value.trim() === "") return null;
  if (!/^\d+$/.test(value.trim())) return Number.NaN;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= maximum ? parsed : Number.NaN;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const district = params.get("district")?.trim() ?? "";
  const scopeLevel = params.get("scopeLevel") ?? "district";
  const sector = params.get("sector")?.trim() || null;
  const cell = params.get("cell")?.trim() || null;
  const village = params.get("village")?.trim() || null;
  const currency = (params.get("currency") ?? "RWF").trim().toUpperCase();
  const mode = params.get("mode") ?? "list";
  const propertyTypes = (params.get("propertyTypes") ?? "")
    .split(",").map((value) => value.trim().toLowerCase())
    .filter((value) => value && PROPERTY_TYPES.has(value));
  const bedroomsMin = positiveInteger(params.get("bedroomsMin"), 30);
  const bathroomsMin = positiveNumber(params.get("bathroomsMin"), 50);
  const bedroomsExact = params.get("bedroomsExact") === "true";
  const bathroomsExact = params.get("bathroomsExact") === "true";
  const areaBasis = params.get("areaBasis") === "interior" ? "interior" : "plot";
  const areaMin = positiveNumber(params.get("areaMin"), 10_000_000);
  const areaMax = positiveNumber(params.get("areaMax"), 10_000_000);
  const priceMin = positiveNumber(params.get("priceMin"), Number.MAX_SAFE_INTEGER);
  const priceMax = positiveNumber(params.get("priceMax"), Number.MAX_SAFE_INTEGER);
  const downPayment = positiveNumber(params.get("downPayment"), Number.MAX_SAFE_INTEGER);
  const annualRate = positiveNumber(params.get("annualRate"), 30);
  const loanMonths = positiveInteger(params.get("loanMonths"), 360);

  if (!district || district.length > 100) return json(400, { ok: false, dataStatus: "invalid_scope", message: "A district is required to scope the map inventory." });
  if (!["district", "sector", "cell", "village"].includes(scopeLevel)) return json(400, { ok: false, dataStatus: "invalid_scope", message: "Unsupported map scope." });
  if (scopeLevel !== "district" && !sector) return json(400, { ok: false, dataStatus: "invalid_scope", message: "The current map scope is missing its sector." });
  if (scopeLevel === "cell" && !cell) return json(400, { ok: false, dataStatus: "invalid_scope", message: "The current map scope is missing its cell." });
  if (scopeLevel === "village" && !village) return json(400, { ok: false, dataStatus: "invalid_scope", message: "The current map scope is missing its village." });
  if (!["RWF", "USD"].includes(currency)) return json(400, { ok: false, dataStatus: "invalid_currency", message: "Choose one supported listing currency." });
  if ([priceMin, priceMax, downPayment, annualRate, bathroomsMin, areaMin, areaMax, bedroomsMin, loanMonths].some((value) => value !== null && Number.isNaN(value))) return json(400, { ok: false, dataStatus: "invalid_numeric_value", message: "Filter and finance values must be valid non-negative numbers within supported input limits." });
  if (!["list", "monthly"].includes(mode)) return json(400, { ok: false, dataStatus: "invalid_mode", message: "Price mode must be list or monthly." });
  if (priceMin !== null && priceMax !== null && priceMin > priceMax) return json(400, { ok: false, dataStatus: "invalid_price_range", message: "Maximum price must be greater than minimum." });
  if (areaMin !== null && areaMax !== null && areaMin > areaMax) return json(400, { ok: false, dataStatus: "invalid_area_range", message: "Maximum area must be greater than minimum." });
  if (mode === "monthly" && (downPayment === null || annualRate === null || loanMonths === null)) {
    return json(200, { ok: true, dataStatus: "needs_finance_terms", total: 0, minimum: null, maximum: null, histogram: [], rows: [], message: "Enter a down payment, annual interest rate and loan term to calculate an estimated monthly principal-and-interest payment." });
  }
  if (mode === "monthly" && downPayment === null) return json(400, { ok: false, dataStatus: "invalid_finance_terms", message: "Down payment must be a non-negative amount." });

  const database = createRejaReadOnlyDatabase();
  if (!database) {
    return json(503, {
      ok: false,
      dataStatus: "not_configured",
      total: 0,
      minimum: null,
      maximum: null,
      histogram: [],
      rows: [],
      message: "The production market database is not connected. No listing prices or property distribution are being inferred."
    });
  }

  try {
    if (!(await verifyRejaReadOnlyRole(database))) {
      return json(503, { ok: false, dataStatus: "unsafe_database_role", message: "The market inventory requires the restricted read-only database role." });
    }

    const schemaRows = await database`
      SELECT
        (
          SELECT count(*) = 4
            FROM information_schema.columns
           WHERE table_schema = 'reja'
             AND table_name = 'sources'
             AND column_name IN ('license_status', 'commercial_use_allowed', 'redistribution_allowed', 'caching_allowed')
        ) AS source_permissions_ready,
        (
          SELECT count(*) = 5
            FROM information_schema.columns
           WHERE table_schema = 'reja'
             AND table_name = 'exchange_listings'
             AND column_name IN ('market_property_id', 'listing_authorization_id', 'seller_user_id', 'seller_organization_id', 'publication_status')
        ) AS exchange_authorization_ready,
        to_regprocedure('reja.has_verified_listing_authorization(bigint,bigint,uuid,bigint)') IS NOT NULL AS authorization_helper_ready,
        to_regclass('reja.development_units') IS NOT NULL AS development_units_ready,
        to_regclass('reja.development_projects') IS NOT NULL AS development_projects_ready,
        to_regclass('reja.development_buildings') IS NOT NULL AS development_buildings_ready,
        (SELECT count(*) = 1 FROM information_schema.columns WHERE table_schema = 'reja' AND table_name = 'market_properties' AND column_name = 'development_unit_id') AS property_unit_link_ready
    `;
    const schema = schemaRows[0] as {
      source_permissions_ready?: boolean;
      exchange_authorization_ready?: boolean;
      authorization_helper_ready?: boolean;
      development_units_ready?: boolean;
      development_projects_ready?: boolean;
      development_buildings_ready?: boolean;
      property_unit_link_ready?: boolean;
    } | undefined;
    if (
      !schema?.source_permissions_ready ||
      !schema.exchange_authorization_ready ||
      !schema.authorization_helper_ready ||
      !schema.development_units_ready ||
      !schema.development_projects_ready ||
      !schema.development_buildings_ready ||
      !schema.property_unit_link_ready
    ) {
      return json(503, {
        ok: false,
        dataStatus: "schema_incomplete",
        total: 0,
        minimum: null,
        maximum: null,
        histogram: [],
        rows: [],
        message: "The connected REJA database does not yet expose the complete source-permission, first-party authorization and linked development-unit schema required for public inventory. Apply the reviewed REJA schema migrations before enabling live listing filters."
      });
    }

    const propertyTypeArray = propertyTypes.length ? propertyTypes : null;
    const scopeCell = scopeLevel === "cell" || scopeLevel === "village" ? cell : null;
    const scopeVillage = scopeLevel === "village" ? village : null;
    const financeRate = annualRate === null ? null : annualRate / 1200;
    const term = loanMonths;

    const histogramRows = await database`
      WITH eligible AS (
        SELECT COALESCE(l.property_id::text, 'source:' || l.id::text) AS property_key,
               1 AS source_priority,
               l.last_seen_at AS observed_at,
               l.asking_amount::numeric AS asking_amount,
               l.currency,
               l.property_type,
               COALESCE(p.bedrooms, u.bedrooms) AS bedrooms,
               COALESCE(p.bathrooms, u.bathrooms) AS bathrooms,
               COALESCE(p.internal_area_sqm, u.internal_area_sqm) AS internal_area_sqm,
               COALESCE(p.plot_area_sqm, u.plot_area_sqm) AS plot_area_sqm,
               p.cell_label,
               p.payload
          FROM reja.market_listings l
          JOIN reja.sources s ON s.id = l.source_id
          LEFT JOIN reja.market_properties p ON p.id = l.property_id AND p.is_current = true
          LEFT JOIN reja.development_units u ON u.id = p.development_unit_id
          LEFT JOIN reja.development_projects dp ON dp.id = u.project_id
          LEFT JOIN reja.development_buildings db ON db.id = u.building_id
         WHERE l.is_current = true
           AND l.listing_type = 'sale'
           AND l.listing_status = 'active'
           AND s.is_current = true
           AND s.license_status = 'permitted'
           AND s.commercial_use_allowed IS TRUE
           AND s.redistribution_allowed IS TRUE
           AND s.caching_allowed IS TRUE
           AND l.currency = ${currency}
           AND lower(l.district_label) = lower(${district})
           AND (${sector}::text IS NULL OR lower(coalesce(l.sector_label, '')) = lower(${sector}))
           AND (${scopeCell}::text IS NULL OR lower(coalesce(p.cell_label, '')) = lower(${scopeCell}))
           AND (${scopeVillage}::text IS NULL OR lower(coalesce(p.payload->>'village', '')) = lower(${scopeVillage}))
           AND (${propertyTypeArray}::text[] IS NULL OR l.property_type = ANY(${propertyTypeArray}::text[]))
           AND (${bedroomsMin}::int IS NULL OR COALESCE(p.bedrooms, u.bedrooms) IS NOT NULL AND (${bedroomsExact} IS TRUE AND COALESCE(p.bedrooms, u.bedrooms) = ${bedroomsMin} OR ${bedroomsExact} IS FALSE AND COALESCE(p.bedrooms, u.bedrooms) >= ${bedroomsMin}))
           AND (${bathroomsMin}::numeric IS NULL OR COALESCE(p.bathrooms, u.bathrooms) IS NOT NULL AND (${bathroomsExact} IS TRUE AND COALESCE(p.bathrooms, u.bathrooms) = ${bathroomsMin} OR ${bathroomsExact} IS FALSE AND COALESCE(p.bathrooms, u.bathrooms) >= ${bathroomsMin}))
           AND (${areaMin}::numeric IS NULL OR (CASE WHEN ${areaBasis} = 'interior' THEN COALESCE(p.internal_area_sqm, u.internal_area_sqm) ELSE COALESCE(p.plot_area_sqm, u.plot_area_sqm) END) >= ${areaMin})
           AND (${areaMax}::numeric IS NULL OR (CASE WHEN ${areaBasis} = 'interior' THEN COALESCE(p.internal_area_sqm, u.internal_area_sqm) ELSE COALESCE(p.plot_area_sqm, u.plot_area_sqm) END) <= ${areaMax})
        UNION ALL
        SELECT COALESCE(l.market_property_id::text, 'exchange:' || l.id::text) AS property_key,
               2 AS source_priority,
               l.published_at AS observed_at,
               l.asking_amount::numeric AS asking_amount,
               l.currency,
               p.property_type,
               COALESCE(p.bedrooms, u.bedrooms) AS bedrooms,
               COALESCE(p.bathrooms, u.bathrooms) AS bathrooms,
               COALESCE(p.internal_area_sqm, u.internal_area_sqm) AS internal_area_sqm,
               COALESCE(p.plot_area_sqm, u.plot_area_sqm) AS plot_area_sqm,
               p.cell_label,
               p.payload
          FROM reja.exchange_listings l
          JOIN reja.market_properties p ON p.id = l.market_property_id AND p.is_current = true
          LEFT JOIN reja.development_units u ON u.id = p.development_unit_id
          LEFT JOIN reja.development_projects dp ON dp.id = u.project_id
          LEFT JOIN reja.development_buildings db ON db.id = u.building_id
         WHERE l.publication_status = 'published'
           AND (l.expires_at IS NULL OR l.expires_at > now())
           AND l.listing_type = 'sale'
           AND l.currency = ${currency}
           AND lower(p.district_label) = lower(${district})
           AND (${sector}::text IS NULL OR lower(coalesce(p.sector_label, '')) = lower(${sector}))
           AND (${scopeCell}::text IS NULL OR lower(coalesce(p.cell_label, '')) = lower(${scopeCell}))
           AND (${scopeVillage}::text IS NULL OR lower(coalesce(p.payload->>'village', '')) = lower(${scopeVillage}))
           AND (${propertyTypeArray}::text[] IS NULL OR p.property_type = ANY(${propertyTypeArray}::text[]))
           AND (${bedroomsMin}::int IS NULL OR COALESCE(p.bedrooms, u.bedrooms) IS NOT NULL AND (${bedroomsExact} IS TRUE AND COALESCE(p.bedrooms, u.bedrooms) = ${bedroomsMin} OR ${bedroomsExact} IS FALSE AND COALESCE(p.bedrooms, u.bedrooms) >= ${bedroomsMin}))
           AND (${bathroomsMin}::numeric IS NULL OR COALESCE(p.bathrooms, u.bathrooms) IS NOT NULL AND (${bathroomsExact} IS TRUE AND COALESCE(p.bathrooms, u.bathrooms) = ${bathroomsMin} OR ${bathroomsExact} IS FALSE AND COALESCE(p.bathrooms, u.bathrooms) >= ${bathroomsMin}))
           AND (${areaMin}::numeric IS NULL OR (CASE WHEN ${areaBasis} = 'interior' THEN COALESCE(p.internal_area_sqm, u.internal_area_sqm) ELSE COALESCE(p.plot_area_sqm, u.plot_area_sqm) END) >= ${areaMin})
           AND (${areaMax}::numeric IS NULL OR (CASE WHEN ${areaBasis} = 'interior' THEN COALESCE(p.internal_area_sqm, u.internal_area_sqm) ELSE COALESCE(p.plot_area_sqm, u.plot_area_sqm) END) <= ${areaMax})
           AND reja.has_verified_listing_authorization(
             l.listing_authorization_id,
             l.market_property_id,
             l.seller_user_id,
             l.seller_organization_id
           )
      ),
      deduplicated AS (
        SELECT DISTINCT ON (property_key) *
          FROM eligible
         ORDER BY property_key, source_priority DESC, observed_at DESC NULLS LAST
      ),
      valued AS (
        SELECT CASE
          WHEN ${mode} = 'list' THEN asking_amount
          WHEN ${financeRate} = 0 THEN GREATEST(asking_amount - ${downPayment}, 0) / ${term}
          ELSE GREATEST(asking_amount - ${downPayment}, 0) * ${financeRate} /
            (1 - power(1 + ${financeRate}, -${term}))
        END AS amount
        FROM deduplicated
      ),
      stats AS (
        SELECT count(*)::integer AS total,
               min(amount) AS minimum,
               max(amount) AS maximum
          FROM valued
      ),
      bins AS (
        SELECT
          CASE
            WHEN stats.maximum = stats.minimum THEN 12
            ELSE least(${HISTOGRAM_BUCKETS}, greatest(1, floor((valued.amount - stats.minimum) / nullif(stats.maximum - stats.minimum, 0) * ${HISTOGRAM_BUCKETS})::integer + 1))
          END AS bucket,
          count(*)::integer AS count
        FROM valued CROSS JOIN stats
        WHERE stats.total > 0
        GROUP BY 1
      )
      SELECT stats.total, stats.minimum::text AS minimum, stats.maximum::text AS maximum,
             bins.bucket, bins.count
        FROM stats
        LEFT JOIN bins ON true
       ORDER BY bins.bucket
    `;

    const rows = await database`
      SELECT l.id::text AS id,
             l.property_id::text AS market_property_id,
             l.asking_amount::text AS asking_amount,
             (CASE WHEN ${mode} = 'list' THEN l.asking_amount WHEN ${financeRate} = 0 THEN GREATEST(l.asking_amount - ${downPayment}, 0) / ${term} ELSE GREATEST(l.asking_amount - ${downPayment}, 0) * ${financeRate} / (1 - power(1 + ${financeRate}, -${term})) END)::text AS filter_amount,
             l.currency,
             l.property_type,
             l.district_label AS district,
             l.sector_label AS sector,
             p.cell_label AS cell,
             p.payload->>'village' AS village,
             COALESCE(p.project_name, dp.name) AS project_name,
             COALESCE(p.building_name, db.name) AS building_name,
             COALESCE(p.unit_label, u.unit_code) AS unit_label,
             COALESCE(p.bedrooms, u.bedrooms) AS bedrooms,
             COALESCE(p.bathrooms, u.bathrooms)::text AS bathrooms,
             COALESCE(p.internal_area_sqm, u.internal_area_sqm)::text AS internal_area_sqm,
             COALESCE(p.plot_area_sqm, u.plot_area_sqm)::text AS plot_area_sqm,
             COALESCE(p.latitude, CASE WHEN GeometryType(dp.location::geometry) = 'POINT' THEN ST_Y(dp.location::geometry) END)::text AS latitude,
             COALESCE(p.longitude, CASE WHEN GeometryType(dp.location::geometry) = 'POINT' THEN ST_X(dp.location::geometry) END)::text AS longitude,
             p.parcel_id::text AS parcel_id,
             l.listing_url,
             s.title AS source_title,
             s.publisher AS source_publisher,
             s.source_url,
             s.attribution_required
        FROM reja.market_listings l
        JOIN reja.sources s ON s.id = l.source_id
        LEFT JOIN reja.market_properties p ON p.id = l.property_id AND p.is_current = true
        LEFT JOIN reja.development_units u ON u.id = p.development_unit_id
        LEFT JOIN reja.development_projects dp ON dp.id = u.project_id
        LEFT JOIN reja.development_buildings db ON db.id = u.building_id
       WHERE l.is_current = true
         AND l.listing_type = 'sale'
           AND l.listing_status = 'active'
         AND s.is_current = true
         AND s.license_status = 'permitted'
         AND s.commercial_use_allowed IS TRUE
         AND s.redistribution_allowed IS TRUE
         AND s.caching_allowed IS TRUE
         AND l.currency = ${currency}
         AND lower(l.district_label) = lower(${district})
         AND (${sector}::text IS NULL OR lower(coalesce(l.sector_label, '')) = lower(${sector}))
         AND (${scopeCell}::text IS NULL OR lower(coalesce(p.cell_label, '')) = lower(${scopeCell}))
         AND (${scopeVillage}::text IS NULL OR lower(coalesce(p.payload->>'village', '')) = lower(${scopeVillage}))
         AND (${propertyTypeArray}::text[] IS NULL OR l.property_type = ANY(${propertyTypeArray}::text[]))
         AND (${bedroomsMin}::int IS NULL OR COALESCE(p.bedrooms, u.bedrooms) IS NOT NULL AND (${bedroomsExact} IS TRUE AND COALESCE(p.bedrooms, u.bedrooms) = ${bedroomsMin} OR ${bedroomsExact} IS FALSE AND COALESCE(p.bedrooms, u.bedrooms) >= ${bedroomsMin}))
         AND (${bathroomsMin}::numeric IS NULL OR COALESCE(p.bathrooms, u.bathrooms) IS NOT NULL AND (${bathroomsExact} IS TRUE AND COALESCE(p.bathrooms, u.bathrooms) = ${bathroomsMin} OR ${bathroomsExact} IS FALSE AND COALESCE(p.bathrooms, u.bathrooms) >= ${bathroomsMin}))
           AND (${areaMin}::numeric IS NULL OR (CASE WHEN ${areaBasis} = 'interior' THEN COALESCE(p.internal_area_sqm, u.internal_area_sqm) ELSE COALESCE(p.plot_area_sqm, u.plot_area_sqm) END) >= ${areaMin})
           AND (${areaMax}::numeric IS NULL OR (CASE WHEN ${areaBasis} = 'interior' THEN COALESCE(p.internal_area_sqm, u.internal_area_sqm) ELSE COALESCE(p.plot_area_sqm, u.plot_area_sqm) END) <= ${areaMax})
         AND (
           CASE
             WHEN ${mode} = 'list' THEN l.asking_amount
             WHEN ${financeRate} = 0 THEN GREATEST(l.asking_amount - ${downPayment}, 0) / ${term}
             ELSE GREATEST(l.asking_amount - ${downPayment}, 0) * ${financeRate} /
               (1 - power(1 + ${financeRate}, -${term}))
           END
         ) >= coalesce(${priceMin}, 0)
         AND (
           ${priceMax}::numeric IS NULL OR
           CASE
             WHEN ${mode} = 'list' THEN l.asking_amount
             WHEN ${financeRate} = 0 THEN GREATEST(l.asking_amount - ${downPayment}, 0) / ${term}
             ELSE GREATEST(l.asking_amount - ${downPayment}, 0) * ${financeRate} /
               (1 - power(1 + ${financeRate}, -${term}))
           END <= ${priceMax}
         )
       ORDER BY l.asking_amount ASC
       LIMIT 500
    `;

    const exchangeRows = await database`
      SELECT ('exchange:' || l.id::text) AS id,
              l.market_property_id::text AS market_property_id,
             l.asking_amount::text AS asking_amount,
             (CASE WHEN ${mode} = 'list' THEN l.asking_amount WHEN ${financeRate} = 0 THEN GREATEST(l.asking_amount - ${downPayment}, 0) / ${term} ELSE GREATEST(l.asking_amount - ${downPayment}, 0) * ${financeRate} / (1 - power(1 + ${financeRate}, -${term})) END)::text AS filter_amount,
             l.currency,
             p.property_type,
             p.district_label AS district,
             p.sector_label AS sector,
             p.cell_label AS cell,
             p.payload->>'village' AS village,
             COALESCE(p.project_name, dp.name) AS project_name,
             COALESCE(p.building_name, db.name) AS building_name,
             COALESCE(p.unit_label, u.unit_code) AS unit_label,
             COALESCE(p.bedrooms, u.bedrooms) AS bedrooms,
             COALESCE(p.bathrooms, u.bathrooms)::text AS bathrooms,
             COALESCE(p.internal_area_sqm, u.internal_area_sqm)::text AS internal_area_sqm,
             COALESCE(p.plot_area_sqm, u.plot_area_sqm)::text AS plot_area_sqm,
             COALESCE(p.latitude, CASE WHEN GeometryType(dp.location::geometry) = 'POINT' THEN ST_Y(dp.location::geometry) END)::text AS latitude,
             COALESCE(p.longitude, CASE WHEN GeometryType(dp.location::geometry) = 'POINT' THEN ST_X(dp.location::geometry) END)::text AS longitude,
             p.parcel_id::text AS parcel_id,
             NULL::text AS listing_url,
             'Taiseel Exchange'::text AS source_title,
             NULL::text AS source_publisher,
             NULL::text AS source_url,
             false AS attribution_required
        FROM reja.exchange_listings l
        JOIN reja.market_properties p ON p.id = l.market_property_id AND p.is_current = true
        LEFT JOIN reja.development_units u ON u.id = p.development_unit_id
        LEFT JOIN reja.development_projects dp ON dp.id = u.project_id
        LEFT JOIN reja.development_buildings db ON db.id = u.building_id
       WHERE l.publication_status = 'published'
         AND (l.expires_at IS NULL OR l.expires_at > now())
         AND l.listing_type = 'sale'
         AND l.currency = ${currency}
         AND lower(p.district_label) = lower(${district})
         AND (${sector}::text IS NULL OR lower(coalesce(p.sector_label, '')) = lower(${sector}))
         AND (${scopeCell}::text IS NULL OR lower(coalesce(p.cell_label, '')) = lower(${scopeCell}))
         AND (${scopeVillage}::text IS NULL OR lower(coalesce(p.payload->>'village', '')) = lower(${scopeVillage}))
         AND (${propertyTypeArray}::text[] IS NULL OR p.property_type = ANY(${propertyTypeArray}::text[]))
         AND (${bedroomsMin}::int IS NULL OR COALESCE(p.bedrooms, u.bedrooms) IS NOT NULL AND (${bedroomsExact} IS TRUE AND COALESCE(p.bedrooms, u.bedrooms) = ${bedroomsMin} OR ${bedroomsExact} IS FALSE AND COALESCE(p.bedrooms, u.bedrooms) >= ${bedroomsMin}))
         AND (${bathroomsMin}::numeric IS NULL OR COALESCE(p.bathrooms, u.bathrooms) IS NOT NULL AND (${bathroomsExact} IS TRUE AND COALESCE(p.bathrooms, u.bathrooms) = ${bathroomsMin} OR ${bathroomsExact} IS FALSE AND COALESCE(p.bathrooms, u.bathrooms) >= ${bathroomsMin}))
         AND (${areaMin}::numeric IS NULL OR (CASE WHEN ${areaBasis} = 'interior' THEN COALESCE(p.internal_area_sqm, u.internal_area_sqm) ELSE COALESCE(p.plot_area_sqm, u.plot_area_sqm) END) >= ${areaMin})
         AND (${areaMax}::numeric IS NULL OR (CASE WHEN ${areaBasis} = 'interior' THEN COALESCE(p.internal_area_sqm, u.internal_area_sqm) ELSE COALESCE(p.plot_area_sqm, u.plot_area_sqm) END) <= ${areaMax})
         AND (
           CASE
             WHEN ${mode} = 'list' THEN l.asking_amount
             WHEN ${financeRate} = 0 THEN GREATEST(l.asking_amount - ${downPayment}, 0) / ${term}
             ELSE GREATEST(l.asking_amount - ${downPayment}, 0) * ${financeRate} /
               (1 - power(1 + ${financeRate}, -${term}))
           END
         ) >= coalesce(${priceMin}, 0)
         AND (
           ${priceMax}::numeric IS NULL OR
           CASE
             WHEN ${mode} = 'list' THEN l.asking_amount
             WHEN ${financeRate} = 0 THEN GREATEST(l.asking_amount - ${downPayment}, 0) / ${term}
             ELSE GREATEST(l.asking_amount - ${downPayment}, 0) * ${financeRate} /
               (1 - power(1 + ${financeRate}, -${term}))
           END <= ${priceMax}
         )
         AND reja.has_verified_listing_authorization(
           l.listing_authorization_id,
           l.market_property_id,
           l.seller_user_id,
           l.seller_organization_id
         )
       ORDER BY l.asking_amount ASC
       LIMIT 500
    `;
     const deduplicatedRows = new Map<string, (typeof rows)[number]>();
     for (const row of rows) deduplicatedRows.set(row.market_property_id ?? row.id, row);
     for (const row of exchangeRows) deduplicatedRows.set(row.market_property_id ?? row.id, row);
     const combinedRows = [...deduplicatedRows.values()];
    const first = histogramRows[0];
    const histogram = histogramRows
      .filter((row) => row.bucket !== null)
      .map((row) => ({ bucket: Number(row.bucket), count: Number(row.count) }));
    const total = Number(first?.total ?? 0);
    return json(200, {
      ok: true,
      dataStatus: total > 0 ? "available" : "no_eligible_records",
      total,
      minimum: first?.minimum === null || first?.minimum === undefined ? null : Number(first.minimum),
      maximum: first?.maximum === null || first?.maximum === undefined ? null : Number(first.maximum),
      histogram,
      rows: combinedRows,
      histogramBasis: mode === "list" ? "authorized_current_asking_prices" : "estimated_monthly_principal_and_interest_from_authorized_asking_prices",
      financeTerms: mode === "monthly" ? { downPayment, annualRate, loanMonths } : null,
      scope: { level: scopeLevel, district, sector, cell: scopeCell, village: scopeVillage },
      message: total > 0 ? null : "No eligible, source-authorized current asking-price listings are connected in this map area. This does not mean no properties are available."
    });
  } catch (error) {
    console.error("[market:filter-inventory] Read failed", error instanceof Error ? error.name : "UnknownError");
    return json(503, {
      ok: false,
      dataStatus: "unavailable",
      total: 0,
      minimum: null,
      maximum: null,
      histogram: [],
      rows: [],
      message: "The source-authorized market inventory could not be read. No price distribution is being inferred."
    });
  }
}
