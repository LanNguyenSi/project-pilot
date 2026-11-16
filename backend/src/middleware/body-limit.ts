import { bodyLimit } from "hono/body-limit";

/**
 * Global request body cap, applied before any route (and so before the
 * rate-limit key generators that read the JSON body).
 *
 * Inventory of body-carrying routes (POST/PUT): every body is a small JSON
 * object. The largest legitimate field is the task description (10000 chars,
 * about 40 KB of UTF-8 in the worst case); next are the install-relay SSH
 * private key (a few KB) and a stored service token (4096 chars max). There
 * is no upload or import route. 128 KiB leaves about 3x headroom over the
 * largest field, so no route needs its own larger limit.
 */
export const MAX_BODY_BYTES = 128 * 1024;

/**
 * Counts the bytes actually received when Content-Length is absent (chunked
 * transfer) or Transfer-Encoding is set, so a missing or lying header does
 * not bypass the cap.
 */
export const requestBodyLimit = bodyLimit({
  maxSize: MAX_BODY_BYTES,
  onError: (c) => c.json({ error: "Payload too large" }, 413),
});
