import { describe, it, expect } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerTools } from "../src/tools.js";
import type { PilotClient } from "../src/client.js";

/**
 * tools/list contract pin for the zod 4 migration.
 *
 * The JSON Schema the MCP server publishes is a wire contract. These
 * assertions capture the post-migration contract through the SDK's own
 * in-memory transport. The migration diff against zod 3 was exactly two
 * converter artifacts, both semantically neutral and accepted:
 *   1. `additionalProperties: false` is no longer emitted on object schemas
 *      (zod 4's JSON Schema converter does not emit it for plain objects;
 *      argument PARSING still strips unknown keys, behaviour unchanged).
 *   2. `description` and `type` swapped key order inside property objects.
 * No name, type, enum, required or description value changed.
 */

type Prop = { type?: string; description?: string; enum?: string[]; items?: { type?: string }; properties?: Record<string, Prop> };
type Tool = { name: string; description?: string; inputSchema: { type: string; properties?: Record<string, Prop>; required?: string[] } };

async function listTools(): Promise<Record<string, Tool>> {
  const noop = async () => ({});
  const client = new Proxy(
    {},
    { get: () => noop },
  ) as unknown as PilotClient;
  const server = new McpServer({ name: "contract-test", version: "0.0.0" });
  registerTools(server, client);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const cli = new Client({ name: "contract-test-client", version: "0.0.0" });
  await cli.connect(clientTransport);
  const { tools } = await cli.listTools();
  return Object.fromEntries((tools as Tool[]).map((t) => [t.name, t]));
}

const EXPECTED: Record<string, { required?: string[]; props: Record<string, string> }> = {
  forge_list_projects: { props: {} },
  forge_create_project: {
    required: ["projectName", "summary"],
    props: { projectName: "string", summary: "string", features: "array", constraints: "array" },
  },
  forge_publish_project: { required: ["sessionId"], props: { sessionId: "string" } },
  tasks_list_projects: { props: {} },
  tasks_list_tasks: { required: ["projectId"], props: { projectId: "string" } },
  tasks_claimable: { props: {} },
  tasks_get_instructions: { required: ["taskId"], props: { taskId: "string" } },
  tasks_claim: { required: ["taskId"], props: { taskId: "string" } },
  tasks_transition: {
    required: ["taskId", "status"],
    props: { taskId: "string", status: "string" },
  },
  tasks_create: {
    required: ["projectId", "title"],
    props: {
      projectId: "string",
      title: "string",
      priority: "string",
      description: "string",
      template: "object",
    },
  },
  deploy_list_servers: { props: {} },
  deploy_list_apps: { props: { server_id: "string" } },
  deploy_app: {
    required: ["server", "app"],
    props: { server: "string", app: "string", force: "boolean", ref: "string" },
  },
  deploy_status: { required: ["deployId"], props: { deployId: "string" } },
  deploy_preflight: { required: ["server", "app"], props: { server: "string", app: "string" } },
  deploy_rollback: { required: ["server", "app"], props: { server: "string", app: "string" } },
  deploy_history: { props: { limit: "number" } },
  dashboard_summary: { props: {} },
};

describe("tools/list published contract (zod 4 converter output)", () => {
  let tools: Record<string, Tool>;

  it("publishes the expected 18 tools", async () => {
    tools = await listTools();
    expect(Object.keys(tools).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it("keeps each tool's input types and required list", async () => {
    tools = await listTools();
    for (const [name, exp] of Object.entries(EXPECTED)) {
      const tool = tools[name]!;
      expect(tool.inputSchema.type, name).toBe("object");
      expect(Object.keys(tool.inputSchema.properties ?? {}), name).toEqual(Object.keys(exp.props));
      for (const [prop, type] of Object.entries(exp.props)) {
        expect(tool.inputSchema.properties![prop]!.type, `${name}.${prop}`).toBe(type);
      }
      expect(tool.inputSchema.required ?? [], `${name}.required`).toEqual(exp.required ?? []);
    }
  });

  it("keeps every property description and the enum values", async () => {
    tools = await listTools();
    expect(tools["deploy_app"]!.inputSchema.properties!["force"]!.description).toBe(
      "Force deploy even if preflight fails",
    );
    expect(tools["tasks_create"]!.inputSchema.properties!["priority"]!.enum).toEqual([
      "CRITICAL",
      "HIGH",
      "MEDIUM",
      "LOW",
    ]);
    expect(tools["tasks_transition"]!.inputSchema.properties!["status"]!.enum).toEqual([
      "open",
      "in_progress",
      "review",
      "done",
    ]);
    expect(tools["tasks_create"]!.inputSchema.properties!["template"]!.properties?.["acceptanceCriteria"]?.items?.type).toBe(
      "string",
    );
  });

  it("documents the accepted converter difference: no additionalProperties key", async () => {
    tools = await listTools();
    const serialized = JSON.stringify(tools);
    expect(serialized).not.toContain("additionalProperties");
  });
});
