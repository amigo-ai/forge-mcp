import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ClientPool } from "../api/client-pool.js";
import { assertValidEntityId } from "../config/storage.js";
import { getClientForOrg, textResult, jsonResult } from "./shared.js";

function findService(
  services: Record<string, unknown>[],
  name: string,
): Record<string, unknown> | undefined {
  return services.find(
    (s) =>
      String(s["name"] ?? s["service_name"]).toLowerCase() ===
      name.toLowerCase(),
  );
}

export function registerVersionTools(
  server: McpServer,
  pool: ClientPool,
): void {
  server.tool(
    "forge_version_set_list",
    "List all version sets for a service, showing pinned versions.",
    {
      service_name: z.string().describe("The service name"),
      org_id: z.string().optional().describe("Org ID (uses active org if omitted)"),
    },
    async ({ service_name, org_id }) => {
      const { orgId, client } = getClientForOrg(pool, org_id);

      const services = await client.paginate<Record<string, unknown>>(
        "service/",
        "services",
      );
      const service = findService(services, service_name);

      if (!service) {
        return textResult(
          `Service "${service_name}" not found in org "${orgId}".`,
        );
      }

      const versionSets = service["version_sets"] as
        | Record<string, unknown>
        | undefined;

      if (!versionSets || Object.keys(versionSets).length === 0) {
        return textResult(
          `No version sets found for service "${service_name}".`,
        );
      }

      return jsonResult(versionSets);
    },
  );

  server.tool(
    "forge_version_set_upsert",
    "Create or update a version set for a service. Use latest=true to pin to the current latest versions.",
    {
      service_name: z.string().describe("The service name"),
      set_name: z
        .string()
        .describe("The version set name (e.g. preview, release)"),
      latest: z
        .boolean()
        .optional()
        .describe("Pin to current latest versions"),
      agent_version: z.number().optional().describe("Specific agent version number"),
      context_graph_version: z
        .number()
        .optional()
        .describe("Specific context graph version number"),
      org_id: z.string().optional().describe("Org ID (uses active org if omitted)"),
    },
    async ({
      service_name,
      set_name,
      latest,
      agent_version,
      context_graph_version,
      org_id,
    }) => {
      const { orgId, client } = getClientForOrg(pool, org_id);

      const services = await client.paginate<Record<string, unknown>>(
        "service/",
        "services",
      );
      const service = findService(services, service_name);

      if (!service) {
        return textResult(
          `Service "${service_name}" not found in org "${orgId}".`,
        );
      }

      const serviceId = String(service["id"]);

      const versionSet: Record<string, unknown> = {
        llm_model_preferences: {},
      };
      if (latest) {
        // The API will pin to latest when null is passed
        versionSet["agent_version_number"] = null;
        versionSet["service_hierarchical_state_machine_version_number"] = null;
      } else {
        if (agent_version !== undefined) {
          versionSet["agent_version_number"] = agent_version;
        }
        if (context_graph_version !== undefined) {
          versionSet[
            "service_hierarchical_state_machine_version_number"
          ] = context_graph_version;
        }
      }

      const result = await client.request(
        `service/${serviceId}/version_sets/${set_name}/`,
        {
          method: "PUT",
          body: { version_set: versionSet },
        },
      );

      return jsonResult(result);
    },
  );

  server.tool(
    "forge_version_set_promote",
    "Promote one version set to another (e.g. preview -> release).",
    {
      service_name: z.string().describe("The service name"),
      source: z
        .string()
        .describe("Source version set name (e.g. preview)"),
      target: z
        .string()
        .describe("Target version set name (e.g. release)"),
      org_id: z.string().optional().describe("Org ID (uses active org if omitted)"),
    },
    async ({ service_name, source, target, org_id }) => {
      const { orgId, client } = getClientForOrg(pool, org_id);

      const services = await client.paginate<Record<string, unknown>>(
        "service/",
        "services",
      );
      const service = findService(services, service_name);

      if (!service) {
        return textResult(
          `Service "${service_name}" not found in org "${orgId}".`,
        );
      }

      const serviceId = String(service["id"]);
      const versionSets = (service["version_sets"] ?? {}) as Record<
        string,
        unknown
      >;
      const sourceSet = versionSets[source] as
        | Record<string, unknown>
        | undefined;

      if (!sourceSet) {
        return textResult(
          `Version set "${source}" not found on service "${service_name}".`,
        );
      }

      // Ensure llm_model_preferences is present
      const promotedSet = {
        ...sourceSet,
        llm_model_preferences:
          (sourceSet["llm_model_preferences"] as Record<string, unknown>) ?? {},
      };

      // Copy source set to target
      const result = await client.request(
        `service/${serviceId}/version_sets/${target}/`,
        {
          method: "PUT",
          body: { version_set: promotedSet },
        },
      );

      const detail = Object.keys(result as Record<string, unknown>).length > 0
        ? `\n${JSON.stringify(result, null, 2)}`
        : "";
      return textResult(
        `Promoted "${source}" -> "${target}" for service "${service_name}".${detail}`,
      );
    },
  );

  server.tool(
    "forge_version_rollback",
    "Roll back an entity to a previous version. Lists available versions for selection.",
    {
      entity_type: z
        .enum(["agent", "context_graph"])
        .describe("The entity type (agent or context_graph)"),
      entity_id: z.string().describe("The entity ID"),
      version_number: z
        .number()
        .describe("The version number to roll back to"),
      org_id: z.string().optional().describe("Org ID (uses active org if omitted)"),
    },
    async ({ entity_type, entity_id, version_number, org_id }) => {
      assertValidEntityId(entity_id);
      const { client } = getClientForOrg(pool, org_id);

      const apiPath =
        entity_type === "agent"
          ? "organization/agent"
          : "organization/service_hierarchical_state_machine";

      // Get the specific version
      const listKey =
        entity_type === "agent" ? "agents" : "service_hierarchical_state_machines";
      const versionListResp = await client.request<Record<string, unknown>>(
        `${apiPath}/${entity_id}/version`,
        {
          queryParams: { version: String(version_number), limit: "1" },
        },
      );
      const versions = versionListResp[listKey] as Record<string, unknown>[] | undefined;
      if (!versions || versions.length === 0) {
        return textResult(
          `Version ${version_number} not found for ${entity_type}/${entity_id}.`,
        );
      }
      const versionResp = versions[0];

      // Create a new version with the old content
      const result = await client.request(`${apiPath}/${entity_id}/`, {
        method: "POST",
        body: versionResp,
      });

      return textResult(
        `Rolled back ${entity_type}/${entity_id} to version ${version_number}.\n` +
          `A new version was created with the rolled-back content.\n${JSON.stringify(result, null, 2)}`,
      );
    },
  );
}
