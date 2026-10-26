import { NextResponse } from "next/server";

export const runtime = "nodejs";

type SourceProbe = {
  id: string;
  name: string;
  url: string;
  category: "administrative" | "cadastral" | "market-data";
  kind?: "arcgis" | "webpage";
};

type ArcGisMetadata = {
  error?: { message?: string; code?: number };
  name?: string;
  layerName?: string;
  serviceDescription?: string;
  description?: string;
  licenseInfo?: string;
  copyrightText?: string;
  accessInformation?: string;
  editingInfo?: { lastEditDate?: number };
  dataLastEditDate?: number;
  lastEditDate?: number;
  layers?: Array<{ id?: number; name?: string }>;
  fields?: Array<{ name?: string }>;
};

const SOURCES: SourceProbe[] = [
  {
    id: "kigali-administrative",
    name: "Kigali City administrative boundaries",
    url: "https://masterplan.kigalicity.gov.rw/server/rest/services/Masterplan2020/Masterplan2020_22Apr2026/MapServer",
    category: "administrative"
  },
  {
    id: "bugesera-administrative",
    name: "Bugesera administrative boundaries",
    url: "https://geodata.rw/server/rest/services/Overlays/Bugesera_Masterplan/MapServer",
    category: "administrative"
  },
  {
    id: "kigali-cadastral",
    name: "Kigali cadastral parcels",
    url: "https://masterplan.kigalicity.gov.rw/server/rest/services/Hosted/Kigali_Parcels_1June2026_for_search/FeatureServer/0",
    category: "cadastral"
  },
  {
    id: "bugesera-cadastral",
    name: "Bugesera cadastral parcels (LAIS)",
    url: "https://services7.arcgis.com/htgaiKX6RV2DDGgK/arcgis/rest/services/Bugesera_Parcels/FeatureServer/0",
    category: "cadastral"
  },
  {
    id: "land-dashboard-prices-page",
    name: "Rwanda Land Dashboard prices page",
    url: "https://rwandalanddashboard.lands.rw/prices",
    category: "market-data",
    kind: "webpage"
  },
  {
    id: "transaction-volume-dataset-page",
    name: "Rwanda transaction-volume dataset page",
    url: "https://data.gov.rw/datasets/3cee397e-8da0-418f-a382-b97feffba7ed",
    category: "market-data",
    kind: "webpage"
  }
];

function safeDate(value: number | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  const milliseconds = value > 10_000_000_000 ? value : value * 1000;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function checkWebPage(source: SourceProbe, checkedAt: string) {
  try {
    const response = await fetch(source.url, {
      headers: { Accept: "text/html,application/json" },
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(6500)
    });

    if (!response.ok) {
      return {
        id: source.id,
        name: source.name,
        category: source.category,
        status: "unavailable" as const,
        httpStatus: response.status,
        serviceTitle: null,
        layerCount: null,
        fields: [] as string[],
        lastEditAt: null,
        licenseDeclared: false,
        licenseStatus: "Page availability checked only; underlying data permissions are not validated",
        attribution: null,
        detail: `The source page returned HTTP ${response.status}. No market data was ingested.`,
        checkedAt
      };
    }

    const body = await response.text();
    const rawTitle = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
    const title = rawTitle
      ?.replace(/<[^>]*>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();

    return {
      id: source.id,
      name: source.name,
      category: source.category,
      status: "reachable" as const,
      httpStatus: response.status,
      serviceTitle: title || source.name,
      layerCount: null,
      fields: [] as string[],
      lastEditAt: null,
      licenseDeclared: false,
      licenseStatus: "Page reachability only; reuse, caching and redistribution permission remain unconfirmed",
      attribution: source.name,
      detail: "The public source page responds. This check does not read or import market-data rows, verify the figures, or approve use or redistribution.",
      checkedAt
    };
  } catch (error) {
    const message = error instanceof Error
      ? error.name === "TimeoutError" || error.name === "AbortError"
        ? "The source page did not respond within 6.5 seconds."
        : error.message
      : "The source page could not be reached.";

    return {
      id: source.id,
      name: source.name,
      category: source.category,
      status: "unavailable" as const,
      httpStatus: null,
      serviceTitle: null,
      layerCount: null,
      fields: [] as string[],
      lastEditAt: null,
      licenseDeclared: false,
      licenseStatus: "Page availability checked only; underlying data permissions are not validated",
      attribution: null,
      detail: message,
      checkedAt
    };
  }
}

async function checkSource(source: SourceProbe, checkedAt: string) {
  if (source.kind === "webpage") return checkWebPage(source, checkedAt);
  try {
    const response = await fetch(`${source.url}?f=json`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(6500)
    });

    if (!response.ok) {
      return {
        id: source.id,
        name: source.name,
        category: source.category,
        status: "unavailable" as const,
        httpStatus: response.status,
        serviceTitle: null,
        layerCount: null,
        fields: [] as string[],
        lastEditAt: null,
        licenseDeclared: false,
        licenseStatus: "Could not read licence metadata",
        attribution: null,
        detail: `The service returned HTTP ${response.status}.`,
        checkedAt
      };
    }

    const metadata = (await response.json()) as ArcGisMetadata;
    if (metadata.error) {
      return {
        id: source.id,
        name: source.name,
        category: source.category,
        status: "unavailable" as const,
        httpStatus: response.status,
        serviceTitle: null,
        layerCount: null,
        fields: [] as string[],
        lastEditAt: null,
        licenseDeclared: false,
        licenseStatus: "Could not read licence metadata",
        attribution: null,
        detail: metadata.error.message ?? "The GIS service returned a metadata error.",
        checkedAt
      };
    }

    const licenseText =
      typeof metadata.licenseInfo === "string" ? metadata.licenseInfo.trim() : "";
    const attribution =
      typeof metadata.copyrightText === "string" && metadata.copyrightText.trim()
        ? metadata.copyrightText.trim()
        : typeof metadata.accessInformation === "string" && metadata.accessInformation.trim()
          ? metadata.accessInformation.trim()
          : null;
    const lastEdit = metadata.editingInfo?.lastEditDate ??
      metadata.dataLastEditDate ??
      metadata.lastEditDate;

    return {
      id: source.id,
      name: source.name,
      category: source.category,
      status: "reachable" as const,
      httpStatus: response.status,
      serviceTitle:
        [metadata.name, metadata.layerName, metadata.serviceDescription, metadata.description]
          .find((value) => typeof value === "string" && value.trim().length > 0)
          ?.trim() ?? source.name,
      layerCount: Array.isArray(metadata.layers) ? metadata.layers.length : null,
      // Field names come from the service schema, not from parcel records.
      fields: Array.isArray(metadata.fields)
        ? metadata.fields.map((field) => field.name).filter((field): field is string => typeof field === "string").slice(0, 40)
        : [],
      lastEditAt: safeDate(lastEdit === undefined ? undefined : Number(lastEdit)),
      licenseDeclared: Boolean(licenseText),
      licenseStatus: licenseText
        ? "A licence statement is present; its terms still require review"
        : "No licence statement declared in service metadata",
      attribution,
      detail: "Endpoint and metadata are reachable. This check does not validate coverage, positional accuracy, legal status, or permission to reuse the data.",
      checkedAt
    };
  } catch (error) {
    const message = error instanceof Error
      ? error.name === "TimeoutError" || error.name === "AbortError"
        ? "The source did not respond within 6.5 seconds."
        : error.message
      : "The source could not be reached.";

    return {
      id: source.id,
      name: source.name,
      category: source.category,
      status: "unavailable" as const,
      httpStatus: null,
      serviceTitle: null,
      layerCount: null,
      fields: [] as string[],
      lastEditAt: null,
      licenseDeclared: false,
      licenseStatus: "Could not read licence metadata",
      attribution: null,
      detail: message,
      checkedAt
    };
  }
}

type IntegrationHealthStatus =
  | "reachable"
  | "unavailable"
  | "not-configured"
  | "invalid-credentials"
  | "not-integrated"
  | "needs-setup";

type IntegrationHealth = {
  id: string;
  name: string;
  category: "hosting" | "email" | "database" | "storage";
  status: IntegrationHealthStatus;
  statusLabel: string;
  detail: string;
};

async function checkResendIntegration(): Promise<IntegrationHealth> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const fromEmail = process.env.RESEND_FROM_EMAIL?.trim();
  const toEmail = process.env.RESEND_TO_EMAIL?.trim();

  if (!apiKey) {
    return {
      id: "resend",
      name: "Resend email",
      category: "email",
      status: "not-configured",
      statusLabel: "API key missing",
      detail: "RESEND_API_KEY is not configured in the running environment. The contact form and sending endpoint are implemented, but email sending stays disabled until server-side settings and a permitted sender are configured."
    };
  }

  try {
    // Read-only API call: validates the key without sending a real email.
    const response = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(5000)
    });

    if (response.status === 401 || response.status === 403) {
      return {
        id: "resend",
        name: "Resend email",
        category: "email",
        status: "invalid-credentials",
        statusLabel: "Key rejected",
        detail: "Resend rejected the configured API key. Replace it in the server-side secret store; the key itself is never returned by this check."
      };
    }

    if (!response.ok) {
      return {
        id: "resend",
        name: "Resend email",
        category: "email",
        status: "unavailable",
        statusLabel: `API HTTP ${response.status}`,
        detail: "Resend could not complete the read-only domain check. No test email was sent."
      };
    }

    const missing: string[] = [];
    if (!fromEmail) missing.push("RESEND_FROM_EMAIL");
    if (!toEmail) missing.push("RESEND_TO_EMAIL");
    if (missing.length) {
      return {
        id: "resend",
        name: "Resend email",
        category: "email",
        status: "needs-setup",
        statusLabel: "API key accepted · sender settings missing",
        detail: `The API key is accepted. Configure ${missing.join(" and ")}. The contact endpoint is wired, but this check does not send a message or prove deliverability.`
      };
    }

    // Verify the configured sender against Resend's current domain list; never
    // treat a present API key as proof that the domain can send production mail.
    const domainResponse = await response.json() as {
      data?: Array<{ name?: string; status?: string }>;
    };
    const senderDomain = fromEmail?.split("@").at(-1)?.toLowerCase() ?? "";
    const verifiedDomain = (domainResponse.data ?? []).find((domain) => {
      const name = domain.name?.toLowerCase();
      return Boolean(name && (senderDomain === name || senderDomain.endsWith("." + name)) &&
        domain.status?.toLowerCase() === "verified");
    });

    if (!verifiedDomain) {
      const testSender = senderDomain === "resend.dev";
      return {
        id: "resend",
        name: "Resend email",
        category: "email",
        status: "needs-setup",
        statusLabel: testSender ? "Test sender only · delivery test pending" : "Sender domain not verified",
        detail: testSender
          ? "The API key is accepted, but resend.dev is a testing sender, not a production identity. Verify a domain you control before customer-facing delivery. No email was sent."
          : "The API key is accepted, but the configured sender domain is not verified in Resend. Verify the domain and its DNS records before expecting email delivery. No email was sent."
      };
    }

    return {
      id: "resend",
      name: "Resend email",
      category: "email",
      status: "needs-setup",
      statusLabel: "Sender verified · delivery test pending",
      detail: "The API key, recipient setting, and sender domain appear configured. Submit a controlled contact-form test and verify receipt before treating email as production-ready. This check does not send email."
    };
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return {
      id: "resend",
      name: "Resend email",
      category: "email",
      status: "unavailable",
      statusLabel: "API not reachable",
      detail: timedOut
        ? "Resend did not respond within five seconds. No email was sent."
        : "Could not reach Resend from this runtime. No email was sent."
    };
  }
}

async function checkIntegrations(): Promise<IntegrationHealth[]> {
  const resend = await checkResendIntegration();
  const databaseStatus: IntegrationHealthStatus = process.env.DATABASE_URL?.trim()
    ? "not-integrated"
    : "not-configured";
  const r2Status: IntegrationHealthStatus =
    process.env.R2_BUCKET_NAME?.trim() ? "needs-setup" : "not-configured";

  return [
    {
      id: "cloudflare-workers",
      name: "Cloudflare Workers hosting",
      category: "hosting",
      status: "needs-setup",
      statusLabel: "Build passes · deployment permission blocked",
      detail: "The vinext Worker build succeeds, but GitHub Actions cannot deploy with its current token. The token must have account-scoped Workers Scripts:Edit permissions. A successful build alone does not mean the site is live."
    },
    {
      id: "cloudflare-kv",
      name: "Workers KV cache",
      category: "storage",
      status: "needs-setup",
      statusLabel: "Binding declared",
      detail: "The VINEXT_KV_CACHE namespace and Worker binding are configured. Live cache operation can only be confirmed after the Worker is deployed successfully."
    },
    resend,
    {
      id: "postgresql",
      name: "Neon / PostgreSQL",
      category: "database",
      status: databaseStatus,
      statusLabel: databaseStatus === "not-configured" ? "No connection string" : "URL present · driver/schema not integrated",
      detail: databaseStatus === "not-configured"
        ? "DATABASE_URL is not configured. The repository has no connected PostgreSQL client/schema workflow, so Neon is not currently used by the app."
        : "DATABASE_URL is present, but this app still has no PostgreSQL client/schema integration. A connection string alone does not prove the database works."
    },
    {
      id: "cloudflare-r2",
      name: "Cloudflare R2 object storage",
      category: "storage",
      status: r2Status,
      statusLabel: r2Status === "not-configured" ? "Not enabled / no bucket binding" : "Bucket name set · binding missing",
      detail: "R2 was not enabled in the Cloudflare account during this audit, and the Worker configuration has no R2 bucket binding. Enabling R2 in the dashboard, creating a bucket and adding its binding are required before file storage can work."
    }
  ];
}

export async function GET() {
  const checkedAt = new Date().toISOString();
  const [results, integrations] = await Promise.all([
    Promise.all(SOURCES.map((source) => checkSource(source, checkedAt))),
    checkIntegrations()
  ]);
  const reachableCount = results.filter((result) => result.status === "reachable").length;

  return NextResponse.json(
    {
      checkedAt,
      reachableCount,
      totalCount: results.length,
      results,
      integrations,
      notice: "Reachability is not a licence approval, completeness assessment, survey validation, or proof of legal title."
    },
    {
      headers: {
        "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=300",
        "X-Data-Check": "ArcGIS metadata only; no parcel features or owner attributes are requested"
      }
    }
  );
}
