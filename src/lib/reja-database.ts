import { neon } from "@neondatabase/serverless";

export type RejaDatabaseStatus =
  | "reachable"
  | "unavailable"
  | "not-configured"
  | "invalid-credentials"
  | "needs-setup";

export type RejaDatabaseHealth = {
  id: "postgresql";
  name: "Neon / PostgreSQL";
  category: "database";
  status: RejaDatabaseStatus;
  statusLabel: string;
  detail: string;
};

type SchemaReadinessRow = {
  migration_catalog: boolean;
  core_assets: boolean;
  market_properties: boolean;
  verified_market_view: boolean;
  geo_areas: boolean;
  parcels: boolean;
  development_units: boolean;
  exchange_listings: boolean;
  market_listings: boolean;
  market_listing_observations: boolean;
  source_reuse_permissions: boolean;
  listing_authorizations: boolean;
  exchange_listing_observations: boolean;
  exchange_listing_events: boolean;
  listing_authorization_helper: boolean;
};

const REQUIRED_SCHEMA = [
  ["migration_catalog", "migration history"],
  ["core_assets", "project and developer records"],
  ["market_properties", "market properties"],
  ["verified_market_view", "verified transaction view"],
  ["geo_areas", "administrative geography"],
  ["parcels", "cadastral parcels"],
  ["development_units", "project units"],
  ["exchange_listings", "first-party exchange listings"],
  ["market_listings", "external market listings"],
  ["market_listing_observations", "external listing history"],
  ["source_reuse_permissions", "source reuse permissions"],
  ["listing_authorizations", "seller listing authorizations"],
  ["exchange_listing_observations", "first-party listing observations"],
  ["exchange_listing_events", "first-party listing event history"],
  ["listing_authorization_helper", "verified seller authorization check"]
] as const;

function integration(
  status: RejaDatabaseStatus,
  statusLabel: string,
  detail: string
): RejaDatabaseHealth {
  return {
    id: "postgresql",
    name: "Neon / PostgreSQL",
    category: "database",
    status,
    statusLabel,
    detail
  };
}

/**
 * Returns a server-only Neon client for public market reads.
 *
 * This deliberately requires APP_DATABASE_URL. It must use the restricted
 * reja_app role, not the migration/database owner. The general DATABASE_URL
 * remains a readiness-check fallback only and is never used by listing reads.
 */
export function createRejaReadOnlyDatabase() {
  const connectionString = process.env.APP_DATABASE_URL?.trim();
  if (!connectionString) return null;

  try {
    const parsed = new URL(connectionString);
    if (
      !["postgres:", "postgresql:"].includes(parsed.protocol) ||
      !parsed.hostname ||
      !parsed.pathname ||
      parsed.pathname === "/"
    ) {
      return null;
    }
  } catch {
    return null;
  }

  return neon(connectionString, {
    fetchOptions: {
      cache: "no-store",
      signal: AbortSignal.timeout(8_000)
    }
  });
}

type RejaReadOnlyRoleRow = {
  is_superuser: boolean;
  bypasses_row_security: boolean;
  can_create_roles: boolean;
  can_create_databases: boolean;
  can_create_objects: boolean;
  can_write: boolean;
};

/**
 * Refuses public listing reads when the configured role can bypass RLS,
 * create database objects, administer roles/databases, or write REJA records.
 */
export async function verifyRejaReadOnlyRole(
  database: NonNullable<ReturnType<typeof createRejaReadOnlyDatabase>>
): Promise<boolean> {
  const rows = await database`
    SELECT
      r.rolsuper AS is_superuser,
      r.rolbypassrls AS bypasses_row_security,
      r.rolcreaterole AS can_create_roles,
      r.rolcreatedb AS can_create_databases,
      (
        has_database_privilege(current_user, current_database(), 'CREATE')
        OR EXISTS (
          SELECT 1
          FROM pg_namespace n
          WHERE n.nspname = 'reja'
            AND has_schema_privilege(current_user, n.oid, 'CREATE')
        )
      ) AS can_create_objects,
      EXISTS (
        SELECT 1
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'reja'
          AND c.relkind IN ('r','p','v','m','f')
          AND (
            has_table_privilege(current_user, c.oid, 'INSERT')
            OR has_table_privilege(current_user, c.oid, 'UPDATE')
            OR has_table_privilege(current_user, c.oid, 'DELETE')
            OR has_table_privilege(current_user, c.oid, 'TRUNCATE')
            OR has_table_privilege(current_user, c.oid, 'REFERENCES')
            OR has_table_privilege(current_user, c.oid, 'TRIGGER')
          )
      ) AS can_write
    FROM pg_roles r
    WHERE r.rolname = current_user
    LIMIT 1
  `;

  const row = rows[0] as RejaReadOnlyRoleRow | undefined;
  return Boolean(
    row &&
    !row.is_superuser &&
    !row.bypasses_row_security &&
    !row.can_create_roles &&
    !row.can_create_databases &&
    !row.can_create_objects &&
    !row.can_write
  );
}

export async function checkRejaDatabaseIntegration(): Promise<RejaDatabaseHealth> {
  const connectionString = process.env.APP_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim();

  if (!connectionString) {
    return integration(
      "not-configured",
      "No connection string",
      "The Neon serverless driver is integrated, but neither APP_DATABASE_URL nor DATABASE_URL is configured in this runtime. The application is not connected to PostgreSQL."
    );
  }

  try {
    const parsed = new URL(connectionString);
    if (
      !["postgres:", "postgresql:"].includes(parsed.protocol) ||
      !parsed.hostname ||
      !parsed.pathname || parsed.pathname === "/"
    ) {
      return integration(
        "invalid-credentials",
        "Invalid PostgreSQL URL",
        "APP_DATABASE_URL or DATABASE_URL must be a valid PostgreSQL connection string. The value itself is never returned."
      );
    }
  } catch {
    return integration(
      "invalid-credentials",
      "Invalid PostgreSQL URL",
      "DATABASE_URL must be a valid PostgreSQL connection string. The value itself is never returned."
    );
  }

  try {
    // HTTP transport works in the Node.js and Cloudflare Worker runtimes.
    // A short timeout keeps the public source-health route bounded.
    const sql = neon(connectionString, {
      fetchOptions: {
        cache: "no-store",
        signal: AbortSignal.timeout(5_000)
      }
    });

    const rows = await sql`
      SELECT
        to_regclass('reja.schema_migrations') IS NOT NULL AS migration_catalog,
        to_regclass('reja.assets') IS NOT NULL AS core_assets,
        to_regclass('reja.market_properties') IS NOT NULL AS market_properties,
        to_regclass('reja.market_verified_transactions') IS NOT NULL AS verified_market_view,
        to_regclass('reja.geo_areas') IS NOT NULL AS geo_areas,
        to_regclass('reja.parcels') IS NOT NULL AS parcels,
        to_regclass('reja.development_units') IS NOT NULL AS development_units,
        to_regclass('reja.exchange_listings') IS NOT NULL AS exchange_listings,
        to_regclass('reja.market_listings') IS NOT NULL AS market_listings,
        to_regclass('reja.market_listing_observations') IS NOT NULL AS market_listing_observations,
        (
          SELECT count(*) = 4
          FROM information_schema.columns
          WHERE table_schema = 'reja'
            AND table_name = 'sources'
            AND column_name IN (
              'license_status',
              'commercial_use_allowed',
              'redistribution_allowed',
              'caching_allowed'
            )
        ) AS source_reuse_permissions,
        to_regclass('reja.listing_authorizations') IS NOT NULL AS listing_authorizations,
        to_regclass('reja.exchange_listing_observations') IS NOT NULL AS exchange_listing_observations,
        to_regclass('reja.exchange_listing_events') IS NOT NULL AS exchange_listing_events,
        to_regprocedure('reja.has_verified_listing_authorization(bigint,bigint,uuid,bigint)') IS NOT NULL
          AS listing_authorization_helper
    `;

    const row = rows[0] as SchemaReadinessRow | undefined;
    if (!row) {
      return integration(
        "unavailable",
        "Database returned no readiness result",
        "The database responded without a schema-readiness row. No schema or data was changed."
      );
    }

    const missing = REQUIRED_SCHEMA
      .filter(([key]) => !row[key])
      .map(([, label]) => label);

    if (missing.length > 0) {
      return integration(
        "needs-setup",
        "Connected · schema incomplete",
        "PostgreSQL is reachable, but the unified Taiseel schema is incomplete. Missing: " +
          missing.join(", ") +
          ". Apply the reviewed REJA migrations before connecting product write workflows."
      );
    }

    return integration(
      "reachable",
      "Connected · unified schema detected",
      "The configured PostgreSQL database responded and the core, geographic, development, market and exchange schema objects are present. This check does not verify imported data quality, user authentication, seller authority or listing permissions."
    );
  } catch (error) {
    const timedOut = error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");

    return integration(
      "unavailable",
      timedOut ? "Database check timed out" : "Database connection failed",
      timedOut
        ? "The PostgreSQL readiness check did not finish within five seconds."
        : "The configured PostgreSQL connection or readiness query failed. Connection details and provider error text are intentionally withheld."
    );
  }
}
