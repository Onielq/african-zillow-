import type { NextConfig } from "next";

// ArcGIS basemap styles must use a browser-safe API key. Next.js only
// exposes NEXT_PUBLIC_* values automatically, so accept the team's existing
// ESRI_API_KEY name and intentionally map it into the browser bundle at build time.
// Restrict this key by website referrer and basemap privileges in ArcGIS.
const esriBrowserKey =
  process.env.NEXT_PUBLIC_ESRI_API_KEY?.trim() ||
  process.env.ESRI_API_KEY?.trim() ||
  "";

const nextConfig: NextConfig = {
  ...(process.env.VINEXT_BUILD === "1" ? {} : { output: "standalone" as const }),
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_ESRI_API_KEY: esriBrowserKey
  }
};

export default nextConfig;
