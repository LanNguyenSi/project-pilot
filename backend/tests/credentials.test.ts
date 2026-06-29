import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * MUTATION COVERAGE — three guards under test:
 *
 *   Guard C (userId scoping in list):    `where: { userId }` in listCredentials → findMany
 *     Mutation: remove where clause → all users' credentials returned
 *     Killed by: "returns only the caller's credentials" assertion on findMany args.
 *
 *   Guard D (encrypt-on-write in upsert): `encrypt(token)` in upsertCredential before prisma.upsert
 *     Mutation: store plaintext directly → `call.create.token === plaintext`
 *     Killed by: `expect(call.create.token).not.toBe(plaintext)` assertion.
 *
 *   Guard E (userId scoping in delete): `userId_service: { userId, service }` in deleteCredential
 *     Mutation: omit userId from where → can delete any user's credential
 *     Killed by: exact where-clause assertion on prisma.delete args.
 */

// Module mocks must be hoisted before any imports that would trigger module evaluation.

vi.mock("../src/middleware/rate-limit.js", () => ({
  rateLimit: () => (_c: any, next: any) => next(),
}));

vi.mock("../src/config/index.js", () => ({
  config: {
    NODE_ENV: "test",
    SESSION_SECRET: "test-session-secret-must-be-32chars!!",
    FRONTEND_URL: "http://localhost:3000",
    BACKEND_URL: "http://localhost:3001",
    PROJECT_FORGE_URL: "http://forge.test",
    AGENT_TASKS_URL: "http://tasks.test",
    DEPLOY_PANEL_URL: "http://deploy.test",
  },
  hasGitHubOAuthConfigured: false,
}));

vi.mock("../src/lib/prisma.js", () => ({
  prisma: {
    serviceCredential: {
      upsert: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock("../src/middleware/auth.js", () => ({
  requireAuth: vi.fn(async (c: any, next: any) => {
    c.set?.("userId", "user-a");
    await next();
  }),
}));

import { prisma } from "../src/lib/prisma.js";
import { requireAuth } from "../src/middleware/auth.js";
import { credentials } from "../src/routes/credentials.js";
import {
  upsertCredential,
  listCredentials,
  deleteCredential,
  getCredential,
} from "../src/services/credentials.js";

// Typed mock refs
const mockSC = prisma.serviceCredential as unknown as {
  upsert: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};
const mockRequireAuth = vi.mocked(requireAuth);

// --- Route request helpers ---

function getCredentialsRoute() {
  return credentials.request("/", { method: "GET" });
}

function putCredential(body: unknown) {
  return credentials.request("/", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteCredentialRoute(service: string) {
  return credentials.request(`/${service}`, { method: "DELETE" });
}

function postValidate(body: unknown) {
  return credentials.request("/validate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ============================================================================
// SERVICE LAYER tests — real crypto, mocked prisma
// (import services directly, bypass the route layer)
// ============================================================================

describe("services/credentials — upsertCredential (Guard D: encrypt-on-write)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stores an ENCRYPTED token — persisted value != plaintext", async () => {
    const plaintext = "my-secret-api-token-xyz";
    mockSC.upsert.mockResolvedValue({
      id: "c1",
      service: "agent-tasks",
      label: null,
      updatedAt: new Date(),
    });

    await upsertCredential("user-a", "agent-tasks", plaintext);

    expect(mockSC.upsert).toHaveBeenCalledOnce();
    const call = mockSC.upsert.mock.calls[0][0] as {
      create: { token: string; userId: string };
      update: { token: string };
    };

    // GUARD D — mutation: skip encrypt() → these fail because token equals plaintext
    expect(call.create.token).not.toBe(plaintext);
    expect(call.update.token).not.toBe(plaintext);
    // Encrypted format is salt:iv:tag:ciphertext (4 colon-separated hex segments)
    expect(call.create.token.split(":")).toHaveLength(4);
  });

  it("scopes the upsert to the correct userId (create.userId and where.userId_service.userId)", async () => {
    mockSC.upsert.mockResolvedValue({
      id: "c1",
      service: "agent-tasks",
      label: null,
      updatedAt: new Date(),
    });

    await upsertCredential("user-a", "agent-tasks", "tok");

    const call = mockSC.upsert.mock.calls[0][0] as {
      where: { userId_service: { userId: string; service: string } };
      create: { userId: string };
    };
    expect(call.where.userId_service.userId).toBe("user-a");
    expect(call.create.userId).toBe("user-a");
  });
});

describe("services/credentials — listCredentials (Guard C: userId scoping)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes userId in the where clause (Guard C — mutation: omit where → assertion fails)", async () => {
    mockSC.findMany.mockResolvedValue([]);

    await listCredentials("user-a");

    // GUARD C — mutation: remove `where:{ userId }` → findMany called without it → fails
    expect(mockSC.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-a" } }),
    );
  });

  it("returns only the summary fields (no token in select)", async () => {
    const now = new Date();
    mockSC.findMany.mockResolvedValue([
      { id: "c1", service: "agent-tasks", label: "prod", updatedAt: now },
    ]);

    const result = await listCredentials("user-a");
    expect(result).toHaveLength(1);
    expect(result[0]).not.toHaveProperty("token");
    expect(result[0]!.id).toBe("c1");
  });
});

describe("services/credentials — deleteCredential (Guard E: userId scoping in delete)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("includes both userId AND service in the where clause (Guard E — mutation: omit userId → fails)", async () => {
    mockSC.delete.mockResolvedValue({});

    await deleteCredential("user-a", "agent-tasks");

    // GUARD E — mutation: remove userId from where → only `{ service }` in clause → assertion fails
    expect(mockSC.delete).toHaveBeenCalledWith({
      where: { userId_service: { userId: "user-a", service: "agent-tasks" } },
    });
  });
});

describe("services/credentials — getCredential (decrypt round-trip)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("decrypts the stored token and returns plaintext", async () => {
    // Use the real encrypt function (real crypto + mocked SESSION_SECRET from config mock)
    const { encrypt } = await import("../src/lib/crypto.js");
    const plaintext = "round-trip-token-value";
    const encrypted = encrypt(plaintext);

    mockSC.findUnique.mockResolvedValue({ token: encrypted });

    const result = await getCredential("user-a", "agent-tasks");
    expect(result).toBe(plaintext);
  });

  it("returns null when no credential exists for the userId+service", async () => {
    mockSC.findUnique.mockResolvedValue(null);

    const result = await getCredential("user-a", "agent-tasks");
    expect(result).toBeNull();
  });
});

// ============================================================================
// ROUTE LAYER tests — mocked requireAuth, mocked prisma, real services
// ============================================================================

describe("GET /credentials — per-user auth and scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockImplementation(async (c: any, next: any) => {
      c.set?.("userId", "user-a");
      await next();
    });
  });

  it("unauthenticated → 401, prisma never called", async () => {
    mockRequireAuth.mockImplementationOnce(async (c: any) =>
      c.json({ error: "unauthorized" }, 401),
    );

    const res = await getCredentialsRoute();
    expect(res.status).toBe(401);
    expect(mockSC.findMany).not.toHaveBeenCalled();
  });

  it("authenticated → 200, returns credentials array", async () => {
    const now = new Date();
    mockSC.findMany.mockResolvedValue([
      { id: "c1", service: "agent-tasks", label: "prod", updatedAt: now },
    ]);

    const res = await getCredentialsRoute();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { credentials: unknown[] };
    expect(body).toHaveProperty("credentials");
    expect(Array.isArray(body.credentials)).toBe(true);
  });

  it("passes caller userId (user-a) to listCredentials → findMany where:{userId:'user-a'}", async () => {
    mockSC.findMany.mockResolvedValue([]);

    await getCredentialsRoute();

    // GUARD C — route correctly threads userId through service → scoped query
    expect(mockSC.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-a" } }),
    );
  });

  it("passes different userId for different callers (user-b isolation check)", async () => {
    mockSC.findMany.mockResolvedValue([]);
    mockRequireAuth.mockImplementationOnce(async (c: any, next: any) => {
      c.set?.("userId", "user-b");
      await next();
    });

    await getCredentialsRoute();
    expect(mockSC.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-b" } }),
    );
  });
});

describe("PUT /credentials — encrypt-on-write and validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockImplementation(async (c: any, next: any) => {
      c.set?.("userId", "user-a");
      await next();
    });
  });

  it("unauthenticated → 401, prisma never called", async () => {
    mockRequireAuth.mockImplementationOnce(async (c: any) =>
      c.json({ error: "unauthorized" }, 401),
    );

    const res = await putCredential({ service: "agent-tasks", token: "tok" });
    expect(res.status).toBe(401);
    expect(mockSC.upsert).not.toHaveBeenCalled();
  });

  it("stores ENCRYPTED token — prisma receives ciphertext, not plaintext (Guard D via route)", async () => {
    const plaintext = "route-level-plaintext-token";
    mockSC.upsert.mockResolvedValue({
      id: "c1",
      service: "agent-tasks",
      label: null,
      updatedAt: new Date(),
    });

    const res = await putCredential({ service: "agent-tasks", token: plaintext });
    expect(res.status).toBe(200);

    expect(mockSC.upsert).toHaveBeenCalledOnce();
    const call = mockSC.upsert.mock.calls[0][0] as {
      create: { token: string };
      update: { token: string };
    };
    // GUARD D — mutation: skip encrypt() → token stored as plaintext → these fail
    expect(call.create.token).not.toBe(plaintext);
    expect(call.update.token).not.toBe(plaintext);
  });

  it("rejects empty token (zod min:1) → 400, prisma not called", async () => {
    const res = await putCredential({ service: "agent-tasks", token: "" });
    expect(res.status).toBe(400);
    expect(mockSC.upsert).not.toHaveBeenCalled();
  });

  it("rejects unknown service → 400, prisma not called", async () => {
    const res = await putCredential({ service: "unknown-svc", token: "tok" });
    expect(res.status).toBe(400);
    expect(mockSC.upsert).not.toHaveBeenCalled();
  });

  it("200 response includes credential summary (no token field exposed)", async () => {
    const now = new Date();
    mockSC.upsert.mockResolvedValue({
      id: "c1",
      service: "agent-tasks",
      label: "my-label",
      updatedAt: now,
    });

    const res = await putCredential({
      service: "agent-tasks",
      token: "secret",
      label: "my-label",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { credential: Record<string, unknown> };
    expect(body.credential).toBeDefined();
    expect(body.credential).not.toHaveProperty("token");
    expect(body.credential.service).toBe("agent-tasks");
  });
});

describe("DELETE /credentials/:service — owner scoping (Guard E via route)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockImplementation(async (c: any, next: any) => {
      c.set?.("userId", "user-a");
      await next();
    });
  });

  it("unauthenticated → 401, prisma never called", async () => {
    mockRequireAuth.mockImplementationOnce(async (c: any) =>
      c.json({ error: "unauthorized" }, 401),
    );

    const res = await deleteCredentialRoute("agent-tasks");
    expect(res.status).toBe(401);
    expect(mockSC.delete).not.toHaveBeenCalled();
  });

  it("deletes only the caller's credential (userId + service in where) → 200", async () => {
    mockSC.delete.mockResolvedValue({});

    const res = await deleteCredentialRoute("agent-tasks");
    expect(res.status).toBe(200);

    // GUARD E — mutation: omit userId from where → assertion fails
    expect(mockSC.delete).toHaveBeenCalledWith({
      where: { userId_service: { userId: "user-a", service: "agent-tasks" } },
    });
  });

  it("returns 400 for unknown service (isValidService guard)", async () => {
    const res = await deleteCredentialRoute("not-a-real-service");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_service");
    expect(mockSC.delete).not.toHaveBeenCalled();
  });

  it("returns 404 when prisma throws (credential does not exist)", async () => {
    mockSC.delete.mockRejectedValue(new Error("Record not found"));

    const res = await deleteCredentialRoute("agent-tasks");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("not_found");
  });
});

describe("POST /credentials/validate — downstream connection check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockImplementation(async (c: any, next: any) => {
      c.set?.("userId", "user-a");
      await next();
    });
  });

  it("returns {valid:false, error:'No token configured'} when no credential stored", async () => {
    mockSC.findUnique.mockResolvedValue(null);

    const res = await postValidate({ service: "agent-tasks" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { valid: boolean; error: string };
    expect(body.valid).toBe(false);
    expect(body.error).toBe("No token configured");
  });

  it("returns {valid:true} when the downstream service responds 200", async () => {
    const { encrypt } = await import("../src/lib/crypto.js");
    mockSC.findUnique.mockResolvedValue({ token: encrypt("real-api-token") });

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("{}", { status: 200 }) as unknown as Response,
    );

    const res = await postValidate({ service: "agent-tasks" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { valid: boolean };
    expect(body.valid).toBe(true);

    fetchSpy.mockRestore();
  });

  it("returns {valid:false, error:'Invalid token'} when downstream returns 401", async () => {
    const { encrypt } = await import("../src/lib/crypto.js");
    mockSC.findUnique.mockResolvedValue({ token: encrypt("bad-token") });

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
      }) as unknown as Response,
    );

    const res = await postValidate({ service: "agent-tasks" });
    const body = (await res.json()) as { valid: boolean; error: string };
    expect(body.valid).toBe(false);
    expect(body.error).toBe("Invalid token");

    fetchSpy.mockRestore();
  });

  it("returns {valid:false, error:'Invalid token'} when downstream returns 403", async () => {
    const { encrypt } = await import("../src/lib/crypto.js");
    mockSC.findUnique.mockResolvedValue({ token: encrypt("tok") });

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("{}", { status: 403 }) as unknown as Response,
    );

    const res = await postValidate({ service: "agent-tasks" });
    const body = (await res.json()) as { valid: boolean; error: string };
    expect(body.valid).toBe(false);
    expect(body.error).toBe("Invalid token");

    fetchSpy.mockRestore();
  });

  it("returns {valid:false, error:'Service rejected the request'} for non-auth upstream error", async () => {
    const { encrypt } = await import("../src/lib/crypto.js");
    mockSC.findUnique.mockResolvedValue({ token: encrypt("tok") });

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("{}", { status: 500 }) as unknown as Response,
    );

    const res = await postValidate({ service: "agent-tasks" });
    const body = (await res.json()) as { valid: boolean; error: string };
    expect(body.valid).toBe(false);
    expect(body.error).toBe("Service rejected the request");

    fetchSpy.mockRestore();
  });

  it("returns {valid:false, error:'Service timed out'} on AbortError", async () => {
    const { encrypt } = await import("../src/lib/crypto.js");
    mockSC.findUnique.mockResolvedValue({ token: encrypt("tok") });

    const abortErr = new DOMException("Aborted", "AbortError");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(abortErr);

    const res = await postValidate({ service: "agent-tasks" });
    const body = (await res.json()) as { valid: boolean; error: string };
    expect(body.valid).toBe(false);
    expect(body.error).toBe("Service timed out");

    fetchSpy.mockRestore();
  });

  it("returns {valid:false, error:'Service unreachable'} on generic network error", async () => {
    const { encrypt } = await import("../src/lib/crypto.js");
    mockSC.findUnique.mockResolvedValue({ token: encrypt("tok") });

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const res = await postValidate({ service: "agent-tasks" });
    const body = (await res.json()) as { valid: boolean; error: string };
    expect(body.valid).toBe(false);
    expect(body.error).toBe("Service unreachable");

    fetchSpy.mockRestore();
  });

  it("rejects unknown service in validate → 400", async () => {
    const res = await postValidate({ service: "not-a-service" });
    expect(res.status).toBe(400);
  });

  it("unauthenticated → 401", async () => {
    mockRequireAuth.mockImplementationOnce(async (c: any) =>
      c.json({ error: "unauthorized" }, 401),
    );

    const res = await postValidate({ service: "agent-tasks" });
    expect(res.status).toBe(401);
    expect(mockSC.findUnique).not.toHaveBeenCalled();
  });
});
