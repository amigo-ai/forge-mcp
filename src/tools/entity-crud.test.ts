import assert from "node:assert/strict";
import { test } from "node:test";
import { registerEntityTools } from "./entity-crud.js";

type ToolHandler = (args: Record<string, unknown>) => Promise<{ content: Array<{ type: "text"; text: string }> }>;

function registerEntityUpdateTool(requestImpl: (path: string, options?: Record<string, unknown>) => Promise<unknown>) {
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

  const updateTool = tools.get("forge_entity_update");
  assert.ok(updateTool, "forge_entity_update should be registered");
  return updateTool;
}

test("forge_entity_update preserves existing agent voice when voice_config is omitted on later updates", async () => {
  const requests: Array<{ path: string; options?: Record<string, unknown> }> = [];
  const updateTool = registerEntityUpdateTool(async (path, options) => {
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

  await updateTool({
    entity_type: "agent",
    entity_id: "agent-123",
    data: { behaviors: ["Updated behavior"] },
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

test("forge_entity_update applies the default voice only for the initial agent version", async () => {
  const requests: Array<{ path: string; options?: Record<string, unknown> }> = [];
  const updateTool = registerEntityUpdateTool(async (path, options) => {
    requests.push({ path, options });

    if (path === "organization/agent" && options?.queryParams) {
      return { agents: [{ id: "agent-123", latest_version: null }] };
    }

    if (path === "organization/agent/agent-123/") {
      return { ok: true };
    }

    throw new Error(`Unexpected request: ${path}`);
  });

  await updateTool({
    entity_type: "agent",
    entity_id: "agent-123",
    data: {
      initials: "MA",
      identity: { name: "Maya" },
      background: "Background",
      behaviors: ["Behavior"],
      communication_patterns: ["Pattern"],
    },
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
