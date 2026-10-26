import type { NextConfig } from "next";
import { buildCsp } from "./src/lib/csp";

const CSP = buildCsp({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_DEPSIGHT_URL: process.env.NEXT_PUBLIC_DEPSIGHT_URL,
});

const nextConfig: NextConfig = {
  output: "standalone",
  headers: async () => [
    {
      source: "/:path*",
      headers: [{ key: "Content-Security-Policy", value: CSP }],
    },
  ],
};

export default nextConfig;
