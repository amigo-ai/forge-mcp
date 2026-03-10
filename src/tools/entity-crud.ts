import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ClientPool } from "../api/client-pool.js";
import {
  ENTITY_TYPES,
  ENTITY_API_PATHS,
  ENTITY_ID_PATHS,
  ENTITY_LIST_KEYS,
  type EntityType,
} from "../config/constants.js";
import { getClientForOrg, textResult, jsonResult } from "./shared.js";

const entityTypeSchema = z
  .enum(ENTITY_TYPES)
  .describe("The entity type");

/** Entity types that do NOT support pagination. */
const NON_PAGINATED_TYPES = new Set<EntityType>(["user_dimension"]);

export function registerEntityTools(server: McpServer, pool: ClientPool): void {
  server.tool(
    "forge_entity_list",
    "List all entities of a given type in an org.",
    {
      entity_type: entityTypeSchema,
      org_id: z.string().optional().describe("Org ID (uses active org if omitted)"),
    },
    async ({ entity_type, org_id }) => {
      const { client } = getClientForOrg(pool, org_id);
      const et = entity_type as EntityType;
      const apiPath = ENTITY_API_PATHS[et];
      const listKey = ENTITY_LIST_KEYS[et];

      if (NON_PAGINATED_TYPES.has(et)) {
        const resp = await client.request<Record<string, unknown>>(apiPath);
        const items = resp[listKey] as unknown[] | undefined;
        if (!items || items.length === 0) {
          return textResult(`No ${entity_type} entities found.`);
        }
        return jsonResult(items);
      }

      const items = await client.paginate(apiPath, listKey);

      if (items.length === 0) {
        return textResult(`No ${entity_type} entities found.`);
      }

      // Return summary with id and name
      const summary = items.map((item: unknown) => {
        const obj = item as Record<string, unknown>;
        const id = obj["id"] ?? obj["_id"];
        const name =
          obj["name"] ??
          obj["agent_name"] ??
          obj["service_name"] ??
          obj["hierarchical_state_machine_name"] ??
          obj["tool_name"] ??
          obj["metric_name"] ??
          obj["persona_name"] ??
          obj["scenario_name"];
        return { id, name };
      });

      return jsonResult(summary);
    },
  );

  server.tool(
    "forge_entity_get",
    "Get the full details of a specific entity by ID. Returns the latest version.",
    {
      entity_type: entityTypeSchema,
      entity_id: z.string().describe("The entity ID"),
      org_id: z.string().optional().describe("Org ID (uses active org if omitted)"),
    },
    async ({ entity_type, entity_id, org_id }) => {
      const { client } = getClientForOrg(pool, org_id);
      const et = entity_type as EntityType;
      const apiPath = ENTITY_API_PATHS[et];
      const listKey = ENTITY_LIST_KEYS[et];

      // Fetch by ID using query param filter
      const resp = await client.request<Record<string, unknown>>(apiPath, {
        queryParams: { id: entity_id, limit: "1" },
      });

      const items = resp[listKey] as unknown[] | undefined;
      if (!items || items.length === 0) {
        return textResult(`Entity ${entity_type}/${entity_id} not found.`);
      }

      return jsonResult(items[0]);
    },
  );

  server.tool(
    "forge_entity_create",
    "Create a new entity of the given type. Provide the entity data as a JSON string or object.",
    {
      entity_type: entityTypeSchema,
      data: z
        .union([z.string(), z.record(z.string(), z.unknown())])
        .describe("The entity data as a JSON string or object"),
      org_id: z.string().optional().describe("Org ID (uses active org if omitted)"),
    },
    async ({ entity_type, data, org_id }) => {
      const { client } = getClientForOrg(pool, org_id);
      const apiPath = ENTITY_API_PATHS[entity_type as EntityType];
      const body = typeof data === "string" ? JSON.parse(data) : data;

      const result = await client.request(apiPath, {
        method: "POST",
        body,
      });

      return jsonResult(result);
    },
  );

  server.tool(
    "forge_entity_update",
    "Update an existing entity by creating a new version. Provide the full version data.",
    {
      entity_type: entityTypeSchema,
      entity_id: z.string().describe("The entity ID to update"),
      data: z
        .union([z.string(), z.record(z.string(), z.unknown())])
        .describe("The version data as a JSON string or object"),
      org_id: z.string().optional().describe("Org ID (uses active org if omitted)"),
    },
    async ({ entity_type, entity_id, data, org_id }) => {
      const { client } = getClientForOrg(pool, org_id);
      const idPath = ENTITY_ID_PATHS[entity_type as EntityType];
      const body = typeof data === "string" ? JSON.parse(data) : data;

      const result = await client.request(`${idPath}/${entity_id}/`, {
        method: "POST",
        body,
      });

      return jsonResult(result);
    },
  );

  server.tool(
    "forge_entity_delete",
    "Delete an entity. This is irreversible.",
    {
      entity_type: entityTypeSchema,
      entity_id: z.string().describe("The entity ID to delete"),
      org_id: z.string().optional().describe("Org ID (uses active org if omitted)"),
    },
    async ({ entity_type, entity_id, org_id }) => {
      const { client } = getClientForOrg(pool, org_id);
      const idPath = ENTITY_ID_PATHS[entity_type as EntityType];

      await client.request(`${idPath}/${entity_id}/`, {
        method: "DELETE",
      });

      return textResult(`Deleted ${entity_type}/${entity_id}.`);
    },
  );
}
