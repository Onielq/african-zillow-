export type BrandImageFit = "contain" | "cover" | "scale-down";

/** Builds an official-site favicon URL when a verified logo asset is unavailable. */
export function websiteFaviconUrl(website?: string | null): string | undefined {
  if (!website) return undefined;
  try {
    const url = new URL(website);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    return "https://www.google.com/s2/favicons?domain=" +
      encodeURIComponent(url.hostname) + "&sz=128";
  } catch {
    return undefined;
  }
}

/** Routes remote brand photos through Cloudflare's image transformation endpoint. */
export function optimizedBrandImageUrl(
  source: string,
  width = 160,
  height = 120,
  fit: BrandImageFit = "contain"
): string {
  const params = new URLSearchParams({
    source,
    width: String(width),
    height: String(height),
    fit
  });
  return "/api/images/transform?" + params.toString();
}
