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
 * body on the wire is byte-compatible with the zod 3 body (same keys, same
 * key order, same status); only zod's own per-issue texts may differ.
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
