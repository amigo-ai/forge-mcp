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
import { assertValidEntityId } from "../config/storage.js";
import { getClientForOrg, textResult, jsonResult } from "./shared.js";
import {
  orgIdParam,
  agentCreateParams,
  agentUpdateParams,
  contextGraphCreateParams,
  contextGraphUpdateParams,
  serviceCreateParams,
  serviceUpdateParams,
  toolCreateParams,
  toolUpdateParams,
  metricCreateParams,
  metricUpdateParams,
  personaCreateParams,
  personaUpdateParams,
  scenarioCreateParams,
  scenarioUpdateParams,
  dynamicBehaviorSetCreateParams,
  dynamicBehaviorSetUpdateParams,
  unitTestCreateParams,
  unitTestUpdateParams,
  unitTestSetCreateParams,
  unitTestSetUpdateParams,
} from "./entity-schemas.js";

const entityTypeSchema = z.enum(ENTITY_TYPES).describe("The entity type");

/** Entity types that do NOT support pagination. */
const NON_PAGINATED_TYPES = new Set<EntityType>(["user_dimension"]);

const DEFAULT_AGENT_VOICE_CONFIG = {
  voice_id: "e07c00bc-4134-4eae-9ea4-1a55fb45746b",
};

// ── Helpers ──

const genericEntityDataSchema = z
  .union([z.string(), z.record(z.string(), z.unknown())])
  .describe("The entity data as a JSON string or object");

function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) clean[k] = v;
  }
  return clean;
}

function parseEntityData(
  data: string | Record<string, unknown>,
): Record<string, unknown> {
  return (typeof data === "string" ? JSON.parse(data) : data) as Record<
    string,
    unknown
  >;
}

async function handleCreate(
  pool: ClientPool,
  et: EntityType,
  body: Record<string, unknown>,
  orgId?: string,
) {
  const { client } = getClientForOrg(pool, orgId);
  const result = await client.request(ENTITY_API_PATHS[et], {
    method: "POST",
    body,
  });
  return jsonResult(result);
}

async function handleUpdate(
  pool: ClientPool,
  et: EntityType,
  entityId: string,
  body: Record<string, unknown>,
  orgId?: string,
) {
  assertValidEntityId(entityId);
  const { client } = getClientForOrg(pool, orgId);
  const result = await client.request(
    `${ENTITY_ID_PATHS[et]}/${entityId}/`,
    { method: "POST", body: stripUndefined(body) },
  );
  return jsonResult(result);
}

async function handleAgentUpdate(
  pool: ClientPool,
  agentId: string,
  body: Record<string, unknown>,
  orgId?: string,
) {
  assertValidEntityId(agentId);
  const { client } = getClientForOrg(pool, orgId);
  const cleanBody = stripUndefined(body);

  // Apply default voice_config for the very first agent version.
  if (cleanBody.voice_config === undefined) {
    const resp = await client.request<Record<string, unknown>>(
      ENTITY_API_PATHS.agent,
      { queryParams: { id: agentId, limit: "1" } },
    );
    const items = resp[ENTITY_LIST_KEYS.agent] as unknown[] | undefined;
    const agent = items?.[0] as Record<string, unknown> | undefined;
    if (!agent || agent.latest_version == null) {
      cleanBody.voice_config = { ...DEFAULT_AGENT_VOICE_CONFIG };
    }
  }

  const result = await client.request(
    `${ENTITY_ID_PATHS.agent}/${agentId}/`,
    { method: "POST", body: cleanBody },
  );
  return jsonResult(result);
}

export function registerEntityTools(
  server: McpServer,
  pool: ClientPool,
): void {
  // ── Generic tools (list, get, delete + generic create/update aliases) ──

  server.tool(
    "forge_entity_list",
    "List all entities of a given type in an org.",
    {
      entity_type: entityTypeSchema,
      org_id: orgIdParam,
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
      org_id: orgIdParam,
    },
    async ({ entity_type, entity_id, org_id }) => {
      assertValidEntityId(entity_id);
      const { client } = getClientForOrg(pool, org_id);
      const et = entity_type as EntityType;
      const apiPath = ENTITY_API_PATHS[et];
      const listKey = ENTITY_LIST_KEYS[et];

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
      data: genericEntityDataSchema,
      org_id: orgIdParam,
    },
    async ({ entity_type, data, org_id }) => {
      return handleCreate(
        pool,
        entity_type as EntityType,
        parseEntityData(data),
        org_id,
      );
    },
  );

  server.tool(
    "forge_entity_update",
    "Update an existing entity by creating a new version. Provide the full version data.",
    {
      entity_type: entityTypeSchema,
      entity_id: z.string().describe("The entity ID to update"),
      data: genericEntityDataSchema,
      org_id: orgIdParam,
    },
    async ({ entity_type, entity_id, data, org_id }) => {
      const body = parseEntityData(data);

      if (entity_type === "agent") {
        return handleAgentUpdate(pool, entity_id, body, org_id);
      }

      return handleUpdate(
        pool,
        entity_type as EntityType,
        entity_id,
        body,
        org_id,
      );
    },
  );

  server.tool(
    "forge_entity_delete",
    "Delete an entity. This is irreversible.",
    {
      entity_type: entityTypeSchema,
      entity_id: z.string().describe("The entity ID to delete"),
      org_id: orgIdParam,
    },
    async ({ entity_type, entity_id, org_id }) => {
      assertValidEntityId(entity_id);
      const { client } = getClientForOrg(pool, org_id);
      const idPath = ENTITY_ID_PATHS[entity_type as EntityType];

      await client.request(`${idPath}/${entity_id}/`, {
        method: "DELETE",
      });

      return textResult(`Deleted ${entity_type}/${entity_id}.`);
    },
  );

  // ── Agent ──

  server.tool(
    "forge_agent_create",
    "Create a new agent.",
    agentCreateParams,
    async ({ agent_name, org_id }) => {
      return handleCreate(pool, "agent", { agent_name }, org_id);
    },
  );

  server.tool(
    "forge_agent_update",
    "Update an agent by creating a new version. The initial version requires: initials, identity, background, behaviors, and communication_patterns. Subsequent versions can include only changed fields. Do NOT include agent_name, greeting, dynamic_behavior_set_ids, user_dimension_ids, or persona_ids.",
    agentUpdateParams,
    async ({ agent_id, org_id, ...versionData }) => {
      return handleAgentUpdate(
        pool,
        agent_id,
        versionData as Record<string, unknown>,
        org_id,
      );
    },
  );

  // ── Context Graph ──

  server.tool(
    "forge_context_graph_create",
    "Create a new context graph (state machine that defines conversation flow).",
    contextGraphCreateParams,
    async ({ state_machine_name, org_id }) => {
      return handleCreate(
        pool,
        "context_graph",
        { state_machine_name },
        org_id,
      );
    },
  );

  server.tool(
    "forge_context_graph_update",
    "Update a context graph by creating a new version. All fields are required. The terminal state must have exactly one action.",
    contextGraphUpdateParams,
    async ({ context_graph_id, org_id, ...versionData }) => {
      return handleUpdate(
        pool,
        "context_graph",
        context_graph_id,
        versionData as Record<string, unknown>,
        org_id,
      );
    },
  );

  // ── Service ──

  server.tool(
    "forge_service_create",
    "Create a new service linking an agent and context graph into a deployable unit.",
    serviceCreateParams,
    async ({ org_id, ...body }) => {
      return handleCreate(pool, "service", body, org_id);
    },
  );

  server.tool(
    "forge_service_update",
    "Update an existing service. Only provided fields are changed.",
    serviceUpdateParams,
    async ({ service_id, org_id, ...body }) => {
      return handleUpdate(
        pool,
        "service",
        service_id,
        body as Record<string, unknown>,
        org_id,
      );
    },
  );

  // ── Tool ──

  server.tool(
    "forge_tool_create",
    "Create a new tool (external action the agent can invoke).",
    toolCreateParams,
    async ({ org_id, ...body }) => {
      return handleCreate(pool, "tool", body, org_id);
    },
  );

  server.tool(
    "forge_tool_update",
    "Update tool metadata (description and tags). Tool versions are published separately.",
    toolUpdateParams,
    async ({ tool_id, org_id, ...body }) => {
      return handleUpdate(
        pool,
        "tool",
        tool_id,
        body as Record<string, unknown>,
        org_id,
      );
    },
  );

  // ── Metric ──

  server.tool(
    "forge_metric_create",
    "Create a new metric for evaluating conversations.",
    metricCreateParams,
    async ({ org_id, ...body }) => {
      return handleCreate(pool, "metric", body, org_id);
    },
  );

  server.tool(
    "forge_metric_update",
    "Update a metric. Only provided fields are changed.",
    metricUpdateParams,
    async ({ metric_id, org_id, ...body }) => {
      return handleUpdate(
        pool,
        "metric",
        metric_id,
        body as Record<string, unknown>,
        org_id,
      );
    },
  );

  // ── Persona ──

  server.tool(
    "forge_persona_create",
    "Create a new simulation persona with its initial version.",
    personaCreateParams,
    async ({ org_id, ...body }) => {
      return handleCreate(pool, "persona", body, org_id);
    },
  );

  server.tool(
    "forge_persona_update",
    "Update persona metadata (tags). Use forge_entity_update for version changes.",
    personaUpdateParams,
    async ({ persona_id, org_id, ...body }) => {
      return handleUpdate(
        pool,
        "persona",
        persona_id,
        body as Record<string, unknown>,
        org_id,
      );
    },
  );

  // ── Scenario ──

  server.tool(
    "forge_scenario_create",
    "Create a new simulation scenario with its initial version.",
    scenarioCreateParams,
    async ({ org_id, ...body }) => {
      return handleCreate(pool, "scenario", body, org_id);
    },
  );

  server.tool(
    "forge_scenario_update",
    "Update scenario metadata (tags). Use forge_entity_update for version changes.",
    scenarioUpdateParams,
    async ({ scenario_id, org_id, ...body }) => {
      return handleUpdate(
        pool,
        "scenario",
        scenario_id,
        body as Record<string, unknown>,
        org_id,
      );
    },
  );

  // ── Dynamic Behavior Set ──

  server.tool(
    "forge_dynamic_behavior_set_create",
    "Create a new dynamic behavior set (runtime instructions injected based on triggers).",
    dynamicBehaviorSetCreateParams,
    async ({ org_id, ...body }) => {
      return handleCreate(
        pool,
        "dynamic_behavior_set",
        body,
        org_id,
      );
    },
  );

  server.tool(
    "forge_dynamic_behavior_set_update",
    "Update dynamic behavior set metadata. Only provided fields are changed.",
    dynamicBehaviorSetUpdateParams,
    async ({ dynamic_behavior_set_id, org_id, ...body }) => {
      return handleUpdate(
        pool,
        "dynamic_behavior_set",
        dynamic_behavior_set_id,
        body as Record<string, unknown>,
        org_id,
      );
    },
  );

  // ── Unit Test ──

  server.tool(
    "forge_unit_test_create",
    "Create a new simulation unit test.",
    unitTestCreateParams,
    async ({ org_id, ...body }) => {
      return handleCreate(pool, "unit_test", body, org_id);
    },
  );

  server.tool(
    "forge_unit_test_update",
    "Update a unit test. Only provided fields are changed.",
    unitTestUpdateParams,
    async ({ unit_test_id, org_id, ...body }) => {
      return handleUpdate(
        pool,
        "unit_test",
        unit_test_id,
        body as Record<string, unknown>,
        org_id,
      );
    },
  );

  // ── Unit Test Set ──

  server.tool(
    "forge_unit_test_set_create",
    "Create a new unit test set (collection of unit tests to run together).",
    unitTestSetCreateParams,
    async ({ org_id, ...body }) => {
      return handleCreate(pool, "unit_test_set", body, org_id);
    },
  );

  server.tool(
    "forge_unit_test_set_update",
    "Update a unit test set. Only provided fields are changed.",
    unitTestSetUpdateParams,
    async ({ unit_test_set_id, org_id, ...body }) => {
      return handleUpdate(
        pool,
        "unit_test_set",
        unit_test_set_id,
        body as Record<string, unknown>,
        org_id,
      );
    },
  );
}
