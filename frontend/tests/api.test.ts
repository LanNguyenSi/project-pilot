import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "../src/lib/api";

// api.ts reads NEXT_PUBLIC_API_URL at module load time; we don't set it here,
// so the module falls back to its documented default.
const BASE_URL = "http://localhost:3001";

describe("apiFetch", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the parsed body on an ok response, calling fetch with the merged init", async () => {
    const data = { id: 1, name: "task" };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => data,
    });

    const result = await apiFetch<typeof data>("/tasks/1");

    expect(result).toEqual(data);
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/tasks/1`,
      expect.objectContaining({
        credentials: "include",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        }),
      })
    );
  });

  it("merges caller headers on top of the defaults instead of replacing them", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    });

    await apiFetch("/x", { method: "POST", headers: { Authorization: "Bearer z" } });

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/x`,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
          Authorization: "Bearer z",
        }),
      })
    );
  });

  it("rejects with an ApiError using body.error when present", async () => {
    const body = { error: "bad request" };
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => body,
    });

    await expect(apiFetch("/tasks")).rejects.toThrow(ApiError);

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => body,
    });

    try {
      await apiFetch("/tasks");
      throw new Error("expected apiFetch to reject");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.message).toBe("bad request");
      expect(apiErr.status).toBe(400);
      expect(apiErr.body).toEqual(body);
      expect(apiErr.name).toBe("ApiError");
    }
  });

  it("falls back to body.message when body.error is absent", async () => {
    const body = { message: "forbidden" };
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => body,
    });

    try {
      await apiFetch("/secure");
      throw new Error("expected apiFetch to reject");
    } catch (err) {
      const apiErr = err as ApiError;
      expect(apiErr.message).toBe("forbidden");
      expect(apiErr.status).toBe(403);
    }
  });

  it("falls back to a generic message when the body is unparseable", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => {
        throw new SyntaxError("bad json");
      },
    });

    try {
      await apiFetch("/broken");
      throw new Error("expected apiFetch to reject");
    } catch (err) {
      const apiErr = err as ApiError;
      expect(apiErr.message).toBe("API error: 500");
      expect(apiErr.status).toBe(500);
      expect(apiErr.body).toEqual({});
    }
  });
});

describe("apiFetch rate limiting (429)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function rejection(body: Record<string, unknown>, retryAfter?: string): Promise<ApiError> {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 429,
      headers: new Headers(retryAfter === undefined ? {} : { "Retry-After": retryAfter }),
      json: async () => body,
    });
    try {
      await apiFetch("/limited");
    } catch (err) {
      return err as ApiError;
    }
    throw new Error("expected apiFetch to reject");
  }

  const limiterBody = { error: "rate_limited", message: "Too many requests. Please try again later." };

  it("shows body.message, not the machine code, and keeps status and body", async () => {
    const err = await rejection(limiterBody);
    expect(err.message).toBe("Too many requests. Please try again later.");
    expect(err.status).toBe(429);
    expect(err.body).toEqual(limiterBody);
    expect(err.retryAfterSeconds).toBeUndefined();
  });

  it("falls back to a fixed text when the body has no message", async () => {
    expect((await rejection({ error: "rate_limited" })).message).toBe("Too many requests, try again later.");
  });

  it("falls back to the fixed text when the message is empty or not a string", async () => {
    expect((await rejection({ error: "rate_limited", message: "   " })).message).toBe(
      "Too many requests, try again later.",
    );
    expect((await rejection({ error: "rate_limited", message: 5 })).message).toBe(
      "Too many requests, try again later.",
    );
  });

  it("appends the wait when Retry-After is in seconds", async () => {
    const err = await rejection(limiterBody, "42");
    expect(err.message).toBe("Too many requests. Please try again later. Try again in 42 s.");
    expect(err.retryAfterSeconds).toBe(42);
  });

  it("appends the wait when Retry-After is an HTTP date, rounded up", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const err = await rejection(limiterBody, "Thu, 01 Jan 2026 00:00:30 GMT");
    expect(err.retryAfterSeconds).toBe(30);
    expect(err.message).toBe("Too many requests. Please try again later. Try again in 30 s.");
  });

  it("caps a very long wait in the display", async () => {
    expect((await rejection(limiterBody, "999999")).retryAfterSeconds).toBe(3600);
  });

  it("ignores an invalid, zero or past Retry-After", async () => {
    for (const value of ["soon", "0", "Thu, 01 Jan 2000 00:00:00 GMT"]) {
      const err = await rejection(limiterBody, value);
      expect(err.retryAfterSeconds).toBeUndefined();
      expect(err.message).toBe("Too many requests. Please try again later.");
    }
  });

  it("shows the message without a wait when the response carries no headers object", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 429, json: async () => limiterBody });
    await expect(apiFetch("/x")).rejects.toMatchObject({
      message: "Too many requests. Please try again later.",
      status: 429,
    });
  });

  it("keeps body.error first for other statuses", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      headers: new Headers({ "Retry-After": "10" }),
      json: async () => ({ error: "down", message: "other" }),
    });
    await expect(apiFetch("/x")).rejects.toMatchObject({ message: "down", status: 503 });
  });
});

describe("ApiError", () => {
  it("carries message, status, body, and a fixed name", () => {
    const err = new ApiError("m", 418, { x: 1 });

    expect(err.message).toBe("m");
    expect(err.status).toBe(418);
    expect(err.body).toEqual({ x: 1 });
    expect(err.name).toBe("ApiError");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ApiError);
  });
});
