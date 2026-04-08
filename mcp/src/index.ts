#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { PilotClient } from "./client.js";
import { registerTools } from "./tools.js";

const config = loadConfig();
const client = new PilotClient(config);

const server = new McpServer({
  name: "project-pilot",
  version: "0.0.1",
});

registerTools(server, client);

const transport = new StdioServerTransport();
await server.connect(transport);
