import * as fs from "node:fs";
import * as path from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ClientPool } from "../api/client-pool.js";
import {
  ENTITY_TYPES,
  ENTITY_API_PATHS,
  ENTITY_LIST_KEYS,
  ENTITY_SYNC_ORDER,
  type EntityType,
} from "../config/constants.js";
import { getClientForOrg, textResult } from "./shared.js";

const entityTypeSchema = z.enum(ENTITY_TYPES).describe("The entity type");

function getEntityDir(orgId: string, entityType: EntityType): string {
  return path.join(process.cwd(), "local", orgId, "entity_data", entityType);
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

/** Get a human-readable name from an entity object. */
function getEntityName(entity: Record<string, unknown>): string {
  return String(
    entity["name"] ??
      entity["agent_name"] ??
      entity["service_name"] ??
      entity["hierarchical_state_machine_name"] ??
      entity["tool_name"] ??
      entity["metric_name"] ??
      entity["persona_name"] ??
      entity["scenario_name"] ??
      entity["id"] ??
      "unknown",
  );
}

/** Sanitize a name for use as a filename. */
function toFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function registerSyncTools(server: McpServer, pool: ClientPool): void {
  server.tool(
    "forge_stl",
    "Sync To Local: Pull entities of a given type from the remote API and save as local JSON files. " +
      "By default, performs a dry run showing what would change. Set apply=true to write files.",
    {
      entity_type: entityTypeSchema,
      org_id: z.string().optional().describe("Org ID (uses active org if omitted)"),
      apply: z
        .boolean()
        .optional()
        .describe("Actually write files (default: false, dry run)"),
    },
    async ({ entity_type, org_id, apply }) => {
      const { orgId, client } = getClientForOrg(pool, org_id);
      const et = entity_type as EntityType;
      const apiPath = ENTITY_API_PATHS[et];
      const listKey = ENTITY_LIST_KEYS[et];

      const items = await client.paginate<Record<string, unknown>>(
        apiPath,
        listKey,
      );

      if (items.length === 0) {
        return textResult(`No ${entity_type} entities found remotely.`);
      }

      const entityDir = getEntityDir(orgId, et);
      const results: string[] = [];

      for (const item of items) {
        const name = getEntityName(item);
        const filename = `${toFilename(name)}.json`;
        const filePath = path.join(entityDir, filename);

        const exists = fs.existsSync(filePath);
        const action = exists ? "update" : "create";

        if (apply) {
          ensureDir(entityDir);
          fs.writeFileSync(filePath, JSON.stringify(item, null, 2) + "\n");
          results.push(`  ${action}: ${filename}`);
        } else {
          results.push(`  would ${action}: ${filename}`);
        }
      }

      const header = apply
        ? `STL complete for ${entity_type} (${orgId}): ${items.length} entities`
        : `STL dry run for ${entity_type} (${orgId}): ${items.length} entities (use apply=true to write)`;

      return textResult(`${header}\n${results.join("\n")}`);
    },
  );

  server.tool(
    "forge_str",
    "Sync To Remote: Push local JSON entity files to the remote API. " +
      "By default, performs a dry run. Set apply=true to push changes.",
    {
      entity_type: entityTypeSchema,
      org_id: z.string().optional().describe("Org ID (uses active org if omitted)"),
      apply: z
        .boolean()
        .optional()
        .describe("Actually push to remote (default: false, dry run)"),
    },
    async ({ entity_type, org_id, apply }) => {
      const { orgId, client } = getClientForOrg(pool, org_id);
      const et = entity_type as EntityType;
      const apiPath = ENTITY_API_PATHS[et];
      const entityDir = getEntityDir(orgId, et);

      if (!fs.existsSync(entityDir)) {
        return textResult(
          `No local directory found at ${entityDir}. Run forge_stl first.`,
        );
      }

      const files = fs
        .readdirSync(entityDir)
        .filter((f) => f.endsWith(".json"));

      if (files.length === 0) {
        return textResult(`No JSON files found in ${entityDir}.`);
      }

      const results: string[] = [];

      for (const file of files) {
        const filePath = path.join(entityDir, file);
        const data = JSON.parse(
          fs.readFileSync(filePath, "utf-8"),
        ) as Record<string, unknown>;

        const entityId = data["id"] as string | undefined;

        if (apply) {
          try {
            if (entityId) {
              await client.request(`${apiPath}/${entityId}/`, {
                method: "POST",
                body: data,
              });
              results.push(`  updated: ${file}`);
            } else {
              const resp = await client.request<Record<string, unknown>>(
                apiPath,
                { method: "POST", body: data },
              );
              // Write back with assigned ID
              const newId = resp["id"] as string | undefined;
              if (newId) {
                data["id"] = newId;
                fs.writeFileSync(
                  filePath,
                  JSON.stringify(data, null, 2) + "\n",
                );
              }
              results.push(`  created: ${file} (id: ${newId ?? "unknown"})`);
            }
          } catch (err) {
            results.push(
              `  FAILED: ${file} -- ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        } else {
          const action = entityId ? "update" : "create";
          results.push(`  would ${action}: ${file}`);
        }
      }

      const header = apply
        ? `STR complete for ${entity_type} (${orgId}): ${files.length} files`
        : `STR dry run for ${entity_type} (${orgId}): ${files.length} files (use apply=true to push)`;

      return textResult(`${header}\n${results.join("\n")}`);
    },
  );

  server.tool(
    "forge_cross_env_sync",
    "Sync entities of a given type from one org to another. Dry run by default.",
    {
      entity_type: entityTypeSchema,
      source_org: z.string().describe("The source org ID"),
      dest_org: z.string().describe("The destination org ID"),
      apply: z
        .boolean()
        .optional()
        .describe("Actually push to destination (default: false, dry run)"),
    },
    async ({ entity_type, source_org, dest_org, apply }) => {
      const et = entity_type as EntityType;
      const apiPath = ENTITY_API_PATHS[et];
      const listKey = ENTITY_LIST_KEYS[et];

      const sourceClient = pool.getClient(source_org);
      const destClient = pool.getClient(dest_org);

      const items = await sourceClient.paginate<Record<string, unknown>>(
        apiPath,
        listKey,
      );

      if (items.length === 0) {
        return textResult(
          `No ${entity_type} entities found in source org "${source_org}".`,
        );
      }

      const results: string[] = [];

      for (const item of items) {
        const name = getEntityName(item);

        if (apply) {
          try {
            // Strip source ID, create fresh in destination
            const { id: _id, _id: __id, ...data } = item;
            await destClient.request(apiPath, {
              method: "POST",
              body: data,
            });
            results.push(`  synced: ${name}`);
          } catch (err) {
            results.push(
              `  FAILED: ${name} -- ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        } else {
          results.push(`  would sync: ${name}`);
        }
      }

      const header = apply
        ? `Cross-env sync complete: ${source_org} -> ${dest_org} (${entity_type}): ${items.length} entities`
        : `Cross-env sync dry run: ${source_org} -> ${dest_org} (${entity_type}): ${items.length} entities`;

      return textResult(`${header}\n${results.join("\n")}`);
    },
  );
}
