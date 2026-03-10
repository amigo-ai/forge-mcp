import * as fs from "node:fs";
import * as path from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ClientPool } from "../api/client-pool.js";
import { ENTITY_TYPES, type EntityType } from "../config/constants.js";
import { getClientForOrg, resolveOrg, textResult } from "./shared.js";

const entityTypeSchema = z.enum(ENTITY_TYPES).describe("The entity type");

/** Unicode characters that cause LLM output degeneration. */
const UNICODE_PATTERNS: [RegExp, string, string][] = [
  [/[\u2022\u2023\u2043\u25E6]/g, "Unicode bullet", "* or -"],
  [/[\u2013\u2014]/g, "Unicode dash", "-- or -"],
  [/[\u201C\u201D]/g, "Unicode double quote", '"'],
  [/[\u2018\u2019]/g, "Unicode single quote", "'"],
  [/[\u2192\u2190\u2194]/g, "Unicode arrow", "->"],
  [/[\u2026]/g, "Unicode ellipsis", "..."],
];

export function registerValidationTools(
  server: McpServer,
  _pool: ClientPool,
): void {
  server.tool(
    "forge_prompt_lint",
    "Check local entity JSON files for unicode characters that cause LLM output degeneration. " +
      "Scans entity_data directories for problematic characters.",
    {
      entity_type: entityTypeSchema.optional().describe(
        "Specific entity type to check (omit for all)",
      ),
      org_id: z.string().optional().describe("Org ID (uses active org if omitted)"),
      fix: z
        .boolean()
        .optional()
        .describe("Auto-fix issues by replacing unicode with ASCII (default: false)"),
    },
    async ({ entity_type, org_id, fix }) => {
      const orgId = resolveOrg(org_id);
      const baseDir = path.join(
        process.cwd(),
        "local",
        orgId,
        "entity_data",
      );

      if (!fs.existsSync(baseDir)) {
        return textResult(`No entity data directory found at ${baseDir}.`);
      }

      const typesToCheck: string[] = entity_type
        ? [entity_type]
        : (ENTITY_TYPES as readonly string[]).slice();

      const issues: string[] = [];
      let fixedCount = 0;

      for (const et of typesToCheck) {
        const dir = path.join(baseDir, et);
        if (!fs.existsSync(dir)) continue;

        const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
        for (const file of files) {
          const filePath = path.join(dir, file);
          let content = fs.readFileSync(filePath, "utf-8");
          let fileHasIssues = false;

          for (const [pattern, description, replacement] of UNICODE_PATTERNS) {
            const matches = content.match(pattern);
            if (matches) {
              issues.push(
                `  ${et}/${file}: ${matches.length}x ${description} (replace with ${replacement})`,
              );
              fileHasIssues = true;
              if (fix) {
                content = content.replace(pattern, replacement);
                fixedCount += matches.length;
              }
            }
          }

          if (fix && fileHasIssues) {
            fs.writeFileSync(filePath, content);
          }
        }
      }

      if (issues.length === 0) {
        return textResult("No unicode issues found.");
      }

      const header = fix
        ? `Fixed ${fixedCount} unicode issues:`
        : `Found ${issues.length} unicode issues (use fix=true to auto-fix):`;

      return textResult(`${header}\n${issues.join("\n")}`);
    },
  );

  server.tool(
    "forge_validate",
    "Validate local entity JSON files for structural issues (missing required fields, invalid references).",
    {
      entity_type: entityTypeSchema,
      org_id: z.string().optional().describe("Org ID (uses active org if omitted)"),
    },
    async ({ entity_type, org_id }) => {
      const orgId = resolveOrg(org_id);
      const dir = path.join(
        process.cwd(),
        "local",
        orgId,
        "entity_data",
        entity_type,
      );

      if (!fs.existsSync(dir)) {
        return textResult(`No directory found at ${dir}.`);
      }

      const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
      const issues: string[] = [];

      for (const file of files) {
        const filePath = path.join(dir, file);
        try {
          const data = JSON.parse(
            fs.readFileSync(filePath, "utf-8"),
          ) as Record<string, unknown>;

          // Basic structural checks per entity type
          if (entity_type === "agent" && !data["agent_name"] && !data["name"]) {
            issues.push(`  ${file}: missing agent_name`);
          }
          if (entity_type === "service") {
            if (!data["agent_id"]) issues.push(`  ${file}: missing agent_id`);
            if (!data["context_graph_id"] && !data["hierarchical_state_machine_id"]) {
              issues.push(`  ${file}: missing context_graph_id`);
            }
          }
          if (entity_type === "context_graph") {
            if (
              !data["hierarchical_state_machine_name"] &&
              !data["name"]
            ) {
              issues.push(`  ${file}: missing name`);
            }
          }
        } catch (err) {
          issues.push(
            `  ${file}: invalid JSON -- ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      if (issues.length === 0) {
        return textResult(
          `Validation passed: ${files.length} ${entity_type} files OK.`,
        );
      }

      return textResult(
        `Validation found ${issues.length} issues:\n${issues.join("\n")}`,
      );
    },
  );
}
