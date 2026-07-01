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
