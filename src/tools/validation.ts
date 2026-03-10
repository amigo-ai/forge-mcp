import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ClientPool } from "../api/client-pool.js";
import { ENTITY_TYPES } from "../config/constants.js";

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
    "Check entity data for unicode characters that cause LLM output degeneration. " +
      "Pass entity data as a JSON object or a raw text string to check.",
    {
      data: z
        .union([z.string(), z.record(z.string(), z.unknown())])
        .describe("Entity data (JSON object) or raw text to check"),
      fix: z
        .boolean()
        .optional()
        .describe("Return fixed content with unicode replaced by ASCII (default: false)"),
    },
    async ({ data, fix }) => {
      const content = typeof data === "string" ? data : JSON.stringify(data, null, 2);

      const issues: string[] = [];
      let fixed = content;

      for (const [pattern, description, replacement] of UNICODE_PATTERNS) {
        const matches = content.match(pattern);
        if (matches) {
          issues.push(
            `  ${matches.length}x ${description} (replace with ${replacement})`,
          );
          if (fix) {
            fixed = fixed.replace(pattern, replacement);
          }
        }
      }

      if (issues.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No unicode issues found." }],
        };
      }

      const header = fix
        ? `Fixed ${issues.length} unicode issue types:`
        : `Found ${issues.length} unicode issue types (use fix=true to get fixed content):`;

      let result = `${header}\n${issues.join("\n")}`;
      if (fix) {
        result += `\n\n--- Fixed content ---\n${fixed}`;
      }

      return { content: [{ type: "text" as const, text: result }] };
    },
  );

  server.tool(
    "forge_validate",
    "Validate entity data for structural issues (missing required fields, invalid references).",
    {
      entity_type: z
        .enum(ENTITY_TYPES)
        .describe("The entity type"),
      data: z
        .record(z.string(), z.unknown())
        .describe("The entity data as a JSON object"),
    },
    async ({ entity_type, data }) => {
      const issues: string[] = [];

      if (entity_type === "agent" && !data["agent_name"] && !data["name"]) {
        issues.push("  missing agent_name");
      }
      if (entity_type === "service") {
        if (!data["agent_id"]) issues.push("  missing agent_id");
        if (!data["context_graph_id"] && !data["hierarchical_state_machine_id"]) {
          issues.push("  missing context_graph_id / hierarchical_state_machine_id");
        }
      }
      if (entity_type === "context_graph") {
        if (
          !data["hierarchical_state_machine_name"] &&
          !data["name"]
        ) {
          issues.push("  missing name / hierarchical_state_machine_name");
        }
      }

      if (issues.length === 0) {
        return {
          content: [{ type: "text" as const, text: `Validation passed for ${entity_type}.` }],
        };
      }

      return {
        content: [{
          type: "text" as const,
          text: `Validation found ${issues.length} issues:\n${issues.join("\n")}`,
        }],
      };
    },
  );
}
