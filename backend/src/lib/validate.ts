import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

/**
 * Shared zValidator wrapper for every JSON body route.
 *
 * With zod 3 the zValidator default failure path serialized the ZodError
 * directly, and the wire body was `{ success: false, error: { issues: [...],
 * name: "ZodError" } }` with status 400. In zod 4 `issues` is a prototype
 * getter (non-enumerable), so serializing the error would emit the envelope
 * without `issues`. This hook rebuilds the envelope explicitly so the 400
 * body on the wire stays envelope-compatible with the zod 3 body: the same
 * envelope `{ success: false, error: { issues: [...], name: "ZodError" } }`
 * and the same status 400. The per-issue entries inside `issues` follow
 * zod 4 (its issue codes, messages and fields may differ from zod 3).
 */
export function zValidate<T extends z.ZodType, Target extends "json" | "query" | "param" | "header" | "form">(
  target: Target,
  schema: T,
) {
  return zValidator(target, schema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          success: false as const,
          error: {
            issues: result.error.issues,
            name: result.error.name,
          },
        },
        400,
      );
    }
  });
}

/** The zod 3 `.url()` check: `new URL(value)` on the raw string must not throw. */
function isRawParsableUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * String schema with exactly the zod 3 `.url()` accept set whose output is
 * the input unchanged.
 *
 * zod 3 `.url()` validated by constructing `new URL(value)` and then passed
 * the raw string on. zod 4 `z.url()` validates the same way but passes on a
 * cleaned value: it trims leading/trailing whitespace and strips tab, CR and
 * LF characters. Both routes using this helper forward the validated value
 * verbatim to an upstream API, so they must keep the zod 3 output: a value
 * with a stray newline must not be silently normalized into a different URL.
 *
 * The failed check produces an issue with code "custom" and message
 * "Invalid url" (zod 3 produced code "invalid_string", validation "url",
 * message "Invalid url"; zod 4 `z.url()` produces code "invalid_format").
 */
export function urlString() {
  return z.string().refine(isRawParsableUrl, { message: "Invalid url" });
}
