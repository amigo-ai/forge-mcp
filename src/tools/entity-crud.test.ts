import assert from "node:assert/strict";
import { test } from "node:test";
import { registerEntityTools } from "./entity-crud.js";

type ToolHandler = (args: Record<string, unknown>) => Promise<{ content: Array<{ type: "text"; text: string }> }>;

function registerTools(requestImpl: (path: string, options?: Record<string, unknown>) => Promise<unknown>) {
  const tools = new Map<string, ToolHandler>();

  const server = {
    tool(
      name: string,
      _description: string,
      _schema: Record<string, unknown>,
      handler: ToolHandler,
    ) {
      tools.set(name, handler);
    },
  };

  const pool = {
    getClient(orgId: string) {
      assert.equal(orgId, "acme");
      return {
        request: requestImpl,
      };
    },
  };

  registerEntityTools(server as never, pool as never);

  return tools;
}

test("forge_agent_update preserves existing agent voice when voice_config is omitted on later updates", async () => {
  const requests: Array<{ path: string; options?: Record<string, unknown> }> = [];
  const tools = registerTools(async (path, options) => {
    requests.push({ path, options });

    if (path === "organization/agent" && options?.queryParams) {
      return {
        agents: [{ id: "agent-123", latest_version: 2, voice_config: { voice_id: "custom-voice" } }],
      };
    }

    if (path === "organization/agent/agent-123/") {
      return { ok: true };
    }

    throw new Error(`Unexpected request: ${path}`);
  });

  const updateTool = tools.get("forge_agent_update");
  assert.ok(updateTool, "forge_agent_update should be registered");

  await updateTool({
    agent_id: "agent-123",
    behaviors: ["Updated behavior"],
    org_id: "acme",
  });

  assert.equal(requests.length, 2);
  assert.deepEqual(requests[0], {
    path: "organization/agent",
    options: { queryParams: { id: "agent-123", limit: "1" } },
  });
  assert.deepEqual(requests[1], {
    path: "organization/agent/agent-123/",
    options: {
      method: "POST",
      body: { behaviors: ["Updated behavior"] },
    },
  });
});

test("forge_agent_update applies the default voice only for the initial agent version", async () => {
  const requests: Array<{ path: string; options?: Record<string, unknown> }> = [];
  const tools = registerTools(async (path, options) => {
    requests.push({ path, options });

    if (path === "organization/agent" && options?.queryParams) {
      return { agents: [{ id: "agent-123", latest_version: null }] };
    }

    if (path === "organization/agent/agent-123/") {
      return { ok: true };
    }

    throw new Error(`Unexpected request: ${path}`);
  });

  const updateTool = tools.get("forge_agent_update");
  assert.ok(updateTool, "forge_agent_update should be registered");

  await updateTool({
    agent_id: "agent-123",
    initials: "MA",
    identity: { name: "Maya" },
    background: "Background",
    behaviors: ["Behavior"],
    communication_patterns: ["Pattern"],
    org_id: "acme",
  });

  assert.equal(requests.length, 2);
  assert.deepEqual(requests[1], {
    path: "organization/agent/agent-123/",
    options: {
      method: "POST",
      body: {
        initials: "MA",
        identity: { name: "Maya" },
        background: "Background",
        behaviors: ["Behavior"],
        communication_patterns: ["Pattern"],
        voice_config: { voice_id: "e07c00bc-4134-4eae-9ea4-1a55fb45746b" },
      },
    },
  });
});

test("forge_agent_create sends agent_name to the API", async () => {
  const requests: Array<{ path: string; options?: Record<string, unknown> }> = [];
  const tools = registerTools(async (path, options) => {
    requests.push({ path, options });
    return { id: "new-agent-id" };
  });

  const createTool = tools.get("forge_agent_create");
  assert.ok(createTool, "forge_agent_create should be registered");

  await createTool({ agent_name: "Test Agent", org_id: "acme" });

  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0], {
    path: "organization/agent",
    options: {
      method: "POST",
      body: { agent_name: "Test Agent" },
    },
  });
});

test("forge_context_graph_create sends state_machine_name to the API", async () => {
  const requests: Array<{ path: string; options?: Record<string, unknown> }> = [];
  const tools = registerTools(async (path, options) => {
    requests.push({ path, options });
    return { id: "new-cg-id" };
  });

  const createTool = tools.get("forge_context_graph_create");
  assert.ok(createTool, "forge_context_graph_create should be registered");

  await createTool({ state_machine_name: "Test Flow", org_id: "acme" });

  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0], {
    path: "organization/service_hierarchical_state_machine",
    options: {
      method: "POST",
      body: { state_machine_name: "Test Flow" },
    },
  });
});

test("forge_service_create sends all service fields to the API", async () => {
  const requests: Array<{ path: string; options?: Record<string, unknown> }> = [];
  const tools = registerTools(async (path, options) => {
    requests.push({ path, options });
    return { id: "new-svc-id" };
  });

  const createTool = tools.get("forge_service_create");
  assert.ok(createTool, "forge_service_create should be registered");

  await createTool({
    agent_id: "agent-1",
    service_hierarchical_state_machine_id: "cg-1",
    name: "My Service",
    description: "Test service",
    is_active: true,
    keyterms: [],
    tags: {},
    org_id: "acme",
  });

  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0], {
    path: "service/",
    options: {
      method: "POST",
      body: {
        agent_id: "agent-1",
        service_hierarchical_state_machine_id: "cg-1",
        name: "My Service",
        description: "Test service",
        is_active: true,
        keyterms: [],
        tags: {},
      },
    },
  });
});
