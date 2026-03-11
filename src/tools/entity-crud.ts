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
  userDimensionCreateParams,
  userDimensionUpdateParams,
} from "./entity-schemas.js";

const entityTypeSchema = z.enum(ENTITY_TYPES).describe("The entity type");

/** Entity types that do NOT support pagination. */
const NON_PAGINATED_TYPES = new Set<EntityType>(["user_dimension"]);

const DEFAULT_AGENT_VOICE_CONFIG = {
  voice_id: "e07c00bc-4134-4eae-9ea4-1a55fb45746b",
};

// ── Helpers ──

function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) clean[k] = v;
  }
  return clean;
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

export function registerEntityTools(
  server: McpServer,
  pool: ClientPool,
): void {
  // ── Generic tools (list, get, delete) ──

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
      assertValidEntityId(agent_id);
      const { client } = getClientForOrg(pool, org_id);
      const body = stripUndefined(versionData as Record<string, unknown>);

      // Apply default voice_config for the very first agent version.
      if (body.voice_config === undefined) {
        const resp = await client.request<Record<string, unknown>>(
          ENTITY_API_PATHS.agent,
          { queryParams: { id: agent_id, limit: "1" } },
        );
        const items = resp[ENTITY_LIST_KEYS.agent] as unknown[] | undefined;
        const agent = items?.[0] as Record<string, unknown> | undefined;
        if (!agent || agent.latest_version == null) {
          body.voice_config = { ...DEFAULT_AGENT_VOICE_CONFIG };
        }
      }

      const result = await client.request(
        `${ENTITY_ID_PATHS.agent}/${agent_id}/`,
        { method: "POST", body },
      );
      return jsonResult(result);
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
    "Update a context graph by creating a new version. All fields are required for the initial version. The terminal state must have exactly one action.",
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
    "Update an existing service.",
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
    async ({ tool_name, description, data, org_id }) => {
      return handleCreate(
        pool,
        "tool",
        { tool_name, ...(description !== undefined ? { description } : {}), ...((data as Record<string, unknown>) ?? {}) },
        org_id,
      );
    },
  );

  server.tool(
    "forge_tool_update",
    "Update a tool by creating a new version.",
    toolUpdateParams,
    async ({ tool_id, data, org_id }) => {
      return handleUpdate(
        pool,
        "tool",
        tool_id,
        data as Record<string, unknown>,
        org_id,
      );
    },
  );

  // ── Metric ──

  server.tool(
    "forge_metric_create",
    "Create a new metric for evaluating conversations.",
    metricCreateParams,
    async ({ metric_name, data, org_id }) => {
      return handleCreate(
        pool,
        "metric",
        { metric_name, ...((data as Record<string, unknown>) ?? {}) },
        org_id,
      );
    },
  );

  server.tool(
    "forge_metric_update",
    "Update a metric by creating a new version.",
    metricUpdateParams,
    async ({ metric_id, data, org_id }) => {
      return handleUpdate(
        pool,
        "metric",
        metric_id,
        data as Record<string, unknown>,
        org_id,
      );
    },
  );

  // ── Persona ──

  server.tool(
    "forge_persona_create",
    "Create a new simulation persona.",
    personaCreateParams,
    async ({ persona_name, data, org_id }) => {
      return handleCreate(
        pool,
        "persona",
        { persona_name, ...((data as Record<string, unknown>) ?? {}) },
        org_id,
      );
    },
  );

  server.tool(
    "forge_persona_update",
    "Update a persona by creating a new version.",
    personaUpdateParams,
    async ({ persona_id, data, org_id }) => {
      return handleUpdate(
        pool,
        "persona",
        persona_id,
        data as Record<string, unknown>,
        org_id,
      );
    },
  );

  // ── Scenario ──

  server.tool(
    "forge_scenario_create",
    "Create a new simulation scenario.",
    scenarioCreateParams,
    async ({ scenario_name, data, org_id }) => {
      return handleCreate(
        pool,
        "scenario",
        { scenario_name, ...((data as Record<string, unknown>) ?? {}) },
        org_id,
      );
    },
  );

  server.tool(
    "forge_scenario_update",
    "Update a scenario by creating a new version.",
    scenarioUpdateParams,
    async ({ scenario_id, data, org_id }) => {
      return handleUpdate(
        pool,
        "scenario",
        scenario_id,
        data as Record<string, unknown>,
        org_id,
      );
    },
  );

  // ── Dynamic Behavior Set ──

  server.tool(
    "forge_dynamic_behavior_set_create",
    "Create a new dynamic behavior set (runtime instructions injected based on triggers).",
    dynamicBehaviorSetCreateParams,
    async ({ data, org_id }) => {
      return handleCreate(
        pool,
        "dynamic_behavior_set",
        data as Record<string, unknown>,
        org_id,
      );
    },
  );

  server.tool(
    "forge_dynamic_behavior_set_update",
    "Update a dynamic behavior set by creating a new version.",
    dynamicBehaviorSetUpdateParams,
    async ({ dynamic_behavior_set_id, data, org_id }) => {
      return handleUpdate(
        pool,
        "dynamic_behavior_set",
        dynamic_behavior_set_id,
        data as Record<string, unknown>,
        org_id,
      );
    },
  );

  // ── Unit Test ──

  server.tool(
    "forge_unit_test_create",
    "Create a new unit test.",
    unitTestCreateParams,
    async ({ data, org_id }) => {
      return handleCreate(
        pool,
        "unit_test",
        data as Record<string, unknown>,
        org_id,
      );
    },
  );

  server.tool(
    "forge_unit_test_update",
    "Update a unit test by creating a new version.",
    unitTestUpdateParams,
    async ({ unit_test_id, data, org_id }) => {
      return handleUpdate(
        pool,
        "unit_test",
        unit_test_id,
        data as Record<string, unknown>,
        org_id,
      );
    },
  );

  // ── Unit Test Set ──

  server.tool(
    "forge_unit_test_set_create",
    "Create a new unit test set (collection of unit tests).",
    unitTestSetCreateParams,
    async ({ data, org_id }) => {
      return handleCreate(
        pool,
        "unit_test_set",
        data as Record<string, unknown>,
        org_id,
      );
    },
  );

  server.tool(
    "forge_unit_test_set_update",
    "Update a unit test set by creating a new version.",
    unitTestSetUpdateParams,
    async ({ unit_test_set_id, data, org_id }) => {
      return handleUpdate(
        pool,
        "unit_test_set",
        unit_test_set_id,
        data as Record<string, unknown>,
        org_id,
      );
    },
  );

  // ── User Dimension ──

  server.tool(
    "forge_user_dimension_create",
    "Create a new user dimension (memory category for tracking user patterns).",
    userDimensionCreateParams,
    async ({ data, org_id }) => {
      return handleCreate(
        pool,
        "user_dimension",
        data as Record<string, unknown>,
        org_id,
      );
    },
  );

  server.tool(
    "forge_user_dimension_update",
    "Update a user dimension by creating a new version.",
    userDimensionUpdateParams,
    async ({ user_dimension_id, data, org_id }) => {
      return handleUpdate(
        pool,
        "user_dimension",
        user_dimension_id,
        data as Record<string, unknown>,
        org_id,
      );
    },
  );
}
