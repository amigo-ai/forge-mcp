import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ClientPool } from "../api/client-pool.js";
import {
  getCredentials,
  saveCredentials,
  removeCredentials,
  listConfiguredOrgs,
  getGlobalConfig,
  saveGlobalConfig,
} from "../config/storage.js";
import { DEFAULT_API_BASE_URL } from "../config/constants.js";
import { setSessionOrg, getSessionOrg, textResult } from "./shared.js";

export function registerOrgTools(server: McpServer, pool: ClientPool): void {
  server.tool(
    "forge_set_org",
    "Set the active org for this session. Subsequent tool calls will use this org by default.",
    {
      org_id: z.string().describe("The org ID to set as active"),
      set_as_default: z
        .boolean()
        .optional()
        .describe("Also save as the default org in ~/.amigo/config.json"),
    },
    async ({ org_id, set_as_default }) => {
      setSessionOrg(org_id);

      if (set_as_default) {
        const config = getGlobalConfig();
        config.default_org = org_id;
        saveGlobalConfig(config);
      }

      const hasCreds = getCredentials(org_id) !== null;
      const credsStatus = hasCreds
        ? "credentials found"
        : "WARNING: no credentials configured -- use forge_add_org first";

      return textResult(
        `Active org set to "${org_id}" (${credsStatus})` +
          (set_as_default ? ". Also saved as default org." : ""),
      );
    },
  );

  server.tool(
    "forge_list_orgs",
    "List all configured orgs with their auth status and show the current session/default org.",
    {},
    async () => {
      const orgs = listConfiguredOrgs();
      const config = getGlobalConfig();
      const session = getSessionOrg();

      if (orgs.length === 0) {
        return textResult(
          "No orgs configured. Use forge_add_org to add credentials for an org.",
        );
      }

      const lines = orgs.map((org) => {
        const markers: string[] = [];
        if (org === session) markers.push("session");
        if (org === config.default_org) markers.push("default");
        const suffix = markers.length > 0 ? ` (${markers.join(", ")})` : "";
        return `  - ${org}${suffix}`;
      });

      return textResult(`Configured orgs:\n${lines.join("\n")}`);
    },
  );

  server.tool(
    "forge_add_org",
    "Add or update credentials for an org. Validates the credentials by signing in.",
    {
      org_id: z.string().describe("The org ID"),
      api_key: z.string().describe("The API key"),
      api_key_id: z.string().describe("The API key ID"),
      user_id: z.string().describe("The user ID"),
      api_base_url: z
        .string()
        .optional()
        .describe(
          `The API base URL (default: ${DEFAULT_API_BASE_URL})`,
        ),
      set_as_default: z
        .boolean()
        .optional()
        .describe("Set this org as the default"),
    },
    async ({ org_id, api_key, api_key_id, user_id, api_base_url, set_as_default }) => {
      const creds = {
        api_key,
        api_key_id,
        user_id,
        api_base_url: api_base_url ?? DEFAULT_API_BASE_URL,
      };

      // Validate by signing in
      const client = pool.registerClient(org_id, creds);
      try {
        // Make a lightweight request to validate
        await client.request("service/", {
          queryParams: { limit: "1" },
        });
      } catch (err) {
        pool.removeClient(org_id);
        return textResult(
          `Failed to validate credentials for "${org_id}": ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      saveCredentials(org_id, creds);

      if (set_as_default) {
        const config = getGlobalConfig();
        config.default_org = org_id;
        saveGlobalConfig(config);
      }

      return textResult(
        `Credentials saved and validated for org "${org_id}"` +
          (set_as_default ? " (set as default)" : "") +
          ".",
      );
    },
  );

  server.tool(
    "forge_remove_org",
    "Remove stored credentials for an org.",
    {
      org_id: z.string().describe("The org ID to remove"),
    },
    async ({ org_id }) => {
      const removed = removeCredentials(org_id);
      pool.removeClient(org_id);

      if (!removed) {
        return textResult(`No credentials found for org "${org_id}".`);
      }

      const config = getGlobalConfig();
      if (config.default_org === org_id) {
        config.default_org = undefined;
        saveGlobalConfig(config);
        return textResult(
          `Credentials removed for org "${org_id}". It was the default org -- default has been cleared.`,
        );
      }

      return textResult(`Credentials removed for org "${org_id}".`);
    },
  );
}
