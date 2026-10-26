// CSP construction lives here (pure, no side effects) so next.config.ts can
// call it and unit tests can cover every branch without booting Next.js.

// Modules embedded via iframe under /security, /tasks/embed, etc. Add to
// this list whenever a new module gets an iframe widget. frame-src allows
// project-pilot to host these origins; frame-ancestors 'none' continues
// to forbid anyone else from framing project-pilot.
const DEFAULT_DEPSIGHT_URL = "https://depsight.opentriologue.ai";

// Same default as frontend/src/lib/api.ts (client-side API base URL), so
// connect-src always covers the origin the browser actually calls. Fixed at
// build time like every NEXT_PUBLIC_* value.
const DEFAULT_API_URL = "http://localhost:3001";

export interface CspEnv {
  NEXT_PUBLIC_API_URL?: string;
  NEXT_PUBLIC_DEPSIGHT_URL?: string;
}

// ORIGIN (scheme://host[:port]) of an API URL, or undefined when the value
// cannot be parsed (then connect-src keeps only 'self', and the build never
// crashes). Never a wildcard, never a path.
function apiOrigin(raw: string | undefined): string | undefined {
  try {
    return new URL(raw || DEFAULT_API_URL).origin;
  } catch {
    return undefined;
  }
}

export function buildCsp(env: CspEnv): string {
  const embeddedModules = [
    env.NEXT_PUBLIC_DEPSIGHT_URL ?? DEFAULT_DEPSIGHT_URL,
  ].join(" ");

  const origin = apiOrigin(env.NEXT_PUBLIC_API_URL);
  // In production the API origin equals the page origin, so listing it next
  // to 'self' is harmless; in dev it is the only way cross-origin API calls
  // on :3001 pass connect-src.
  const connectSrc = origin ? `'self' ${origin}` : "'self'";

  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    `connect-src ${connectSrc}`,
    `frame-src 'self' ${embeddedModules}`,
    "frame-ancestors 'none'",
  ].join("; ");
}
