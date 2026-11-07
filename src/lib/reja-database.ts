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
};

const REQUIRED_SCHEMA = [
  ["migration_catalog", "migration history"],
  ["core_assets", "project and developer records"],
  ["market_properties", "market properties"],
  ["verified_market_view", "verified transaction view"],
  ["geo_areas", "administrative geography"],
  ["parcels", "cadastral parcels"],
  ["development_units", "project units"],
  ["exchange_listings", "first-party exchange listings"]
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

export async function checkRejaDatabaseIntegration(): Promise<RejaDatabaseHealth> {
  const connectionString = process.env.DATABASE_URL?.trim();

  if (!connectionString) {
    return integration(
      "not-configured",
      "No connection string",
      "The Neon serverless driver is integrated, but DATABASE_URL is not configured in this runtime. The application is not connected to PostgreSQL."
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
        "DATABASE_URL must be a valid PostgreSQL connection string. The value itself is never returned."
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
        to_regclass('reja.exchange_listings') IS NOT NULL AS exchange_listings
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
