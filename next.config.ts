import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.VINEXT_BUILD === "1" ? {} : { output: "standalone" as const }),
  reactStrictMode: true
};

export default nextConfig;
