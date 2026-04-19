import type { NextConfig } from "next";

// Modules embedded via iframe under /security, /tasks/embed, etc. Add to
// this list whenever a new module gets an iframe widget. frame-src allows
// project-pilot to host these origins; frame-ancestors 'none' continues
// to forbid anyone else from framing project-pilot.
const EMBEDDED_MODULES = [
  process.env.NEXT_PUBLIC_DEPSIGHT_URL ?? "https://depsight.opentriologue.ai",
].join(" ");

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  `frame-src 'self' ${EMBEDDED_MODULES}`,
  "frame-ancestors 'none'",
].join("; ");

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
