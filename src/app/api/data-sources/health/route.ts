import { NextResponse } from "next/server";

export const runtime = "nodejs";

type SourceProbe = {
  id: string;
  name: string;
  url: string;
  category: "administrative" | "cadastral";
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

async function checkSource(source: SourceProbe, checkedAt: string) {
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

export async function GET() {
  const checkedAt = new Date().toISOString();
  const results = await Promise.all(SOURCES.map((source) => checkSource(source, checkedAt)));
  const reachableCount = results.filter((result) => result.status === "reachable").length;

  return NextResponse.json(
    {
      checkedAt,
      reachableCount,
      totalCount: results.length,
      results,
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
