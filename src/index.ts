#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ClientPool } from "./api/client-pool.js";
import { DEFAULT_API_BASE_URL } from "./config/constants.js";
import {
  assertValidOrgId,
  saveCredentials,
  getGlobalConfig,
  saveGlobalConfig,
} from "./config/storage.js";
import { registerOrgTools } from "./tools/org-management.js";
import { registerEntityTools } from "./tools/entity-crud.js";

import { registerConversationTools } from "./tools/conversation.js";
import { registerVersionTools } from "./tools/version-management.js";

import { registerResources } from "./resources/instructions.js";
import { setSessionOrg } from "./tools/shared.js";

const server = new McpServer({
  name: "forge-tools",
  version: "0.1.0",
});

const pool = new ClientPool();

// Bootstrap from environment variables if present
const envOrg = process.env["AMIGO_ORG_ID"];
const envApiKey = process.env["AMIGO_API_KEY"];
const envApiKeyId = process.env["AMIGO_API_KEY_ID"];
const envUserId = process.env["AMIGO_USER_ID"];
const envBaseUrl = process.env["AMIGO_API_BASE_URL"];

if (envOrg && envApiKey && envApiKeyId && envUserId) {
  assertValidOrgId(envOrg);

  const creds = {
    api_key: envApiKey,
    api_key_id: envApiKeyId,
    user_id: envUserId,
    api_base_url: envBaseUrl ?? DEFAULT_API_BASE_URL,
  };

  // Register in pool (in-memory, no file write)
  pool.registerClient(envOrg, creds);

  // Also persist so future runs without env vars still work
  saveCredentials(envOrg, creds);

  // Set as session org
  setSessionOrg(envOrg);

  // Set as default if none configured
  const config = getGlobalConfig();
  if (!config.default_org) {
    config.default_org = envOrg;
    saveGlobalConfig(config);
  }

  process.stderr.write(`[forge-mcp] Bootstrapped with org "${envOrg}" from environment variables\n`);
} else if (envOrg) {
  assertValidOrgId(envOrg);

  // Org specified but missing other creds -- just set session org
  setSessionOrg(envOrg);
}

// Register all tools and resources
registerOrgTools(server, pool);
registerEntityTools(server, pool);

registerConversationTools(server, pool);
registerVersionTools(server, pool);

registerResources(server);

// Start stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);

process.stderr.write("[forge-mcp] Server started on stdio\n");
