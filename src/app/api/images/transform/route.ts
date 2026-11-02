import { NextRequest, NextResponse } from "next/server";
import { RWANDA_DEVELOPER_CANDIDATES } from "@/data/developer-directory";
import { RWANDA_PROJECT_RECORDS } from "@/data/project-directory";

export const runtime = "edge";

type ImageFetchOptions = RequestInit & {
  cf?: {
    image: {
      format: "avif" | "webp" | "jpeg";
      width: number;
      height: number;
      fit: "contain" | "cover" | "scale-down";
      quality: number;
    };
  };
};

function hostFrom(value?: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

const ALLOWED_IMAGE_HOSTS = new Set<string>([
  "google.com",
  "www.google.com",
  ...RWANDA_DEVELOPER_CANDIDATES.flatMap((record) => [
    hostFrom(record.website),
    hostFrom(record.logoUrl)
  ]),
  ...RWANDA_PROJECT_RECORDS.map((record) => hostFrom(record.imageUrl))
].filter((host): host is string => Boolean(host)));

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const rawSource = params.get("source");
  if (!rawSource || rawSource.length > 2048) {
    return NextResponse.json({ error: "A valid source image is required." }, { status: 400 });
  }

  let source: URL;
  try {
    source = new URL(rawSource);
  } catch {
    return NextResponse.json({ error: "The source image URL is invalid." }, { status: 400 });
  }
  if (
    source.protocol !== "https:" ||
    source.username ||
    source.password ||
    !ALLOWED_IMAGE_HOSTS.has(source.hostname.toLowerCase())
  ) {
    return NextResponse.json({ error: "This image source is not approved." }, { status: 403 });
  }

  const readDimension = (value: string | null, fallback: number) => {
    const parsed = Number.parseInt(value ?? "", 10);
    return Number.isFinite(parsed) ? Math.min(1200, Math.max(24, parsed)) : fallback;
  };
  const width = readDimension(params.get("width"), 160);
  const height = readDimension(params.get("height"), 120);
  const requestedFit = params.get("fit");
  const fit = requestedFit === "cover" || requestedFit === "scale-down" ? requestedFit : "contain";
  const accept = request.headers.get("accept") ?? "";
  const format = accept.includes("image/avif")
    ? "avif"
    : accept.includes("image/webp")
      ? "webp"
      : "jpeg";

  const headers = new Headers({
    Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif,*/*;q=0.5",
    "User-Agent": "Taiseel Brand Image Optimizer"
  });

  let response: Response;
  let optimized = false;
  try {
    response = await fetch(source.toString(), {
      headers,
      cf: {
        image: {
          format,
          width,
          height,
          fit,
          quality: 78
        }
      }
    } as ImageFetchOptions);
    if (!response.ok) throw new Error("Image transformation request failed.");
    optimized = Boolean(response.headers.get("cf-resized"));
  } catch {
    // Keep the directory usable when image transformations are unavailable.
    response = await fetch(source.toString(), { headers });
  }

  if (!response.ok) {
    return new NextResponse(null, {
      status: 502,
      headers: { "Cache-Control": "public, max-age=300" }
    });
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("image/")) {
    return new NextResponse(null, { status: 415 });
  }

  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > 8_000_000) {
    return new NextResponse(null, { status: 413 });
  }

  return new NextResponse(response.body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400, s-maxage=2592000, stale-while-revalidate=604800",
      "Vary": "Accept",
      "X-Content-Type-Options": "nosniff",
      "X-Image-Optimization": optimized ? format : "origin-fallback"
    }
  });
}
