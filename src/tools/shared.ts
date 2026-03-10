import type { ClientPool } from "../api/client-pool.js";
import { getGlobalConfig } from "../config/storage.js";

/** Session-level active org, set via forge_set_org. */
let sessionOrg: string | undefined;

export function getSessionOrg(): string | undefined {
  return sessionOrg;
}

export function setSessionOrg(orgId: string): void {
  sessionOrg = orgId;
}

/**
 * Resolve the org to use, with fallback chain:
 * explicit arg -> session org -> default org in config -> error
 */
export function resolveOrg(explicitOrg?: string): string {
  if (explicitOrg) return explicitOrg;
  if (sessionOrg) return sessionOrg;

  const config = getGlobalConfig();
  if (config.default_org) return config.default_org;

  throw new Error(
    "No org specified. Provide org_id, use forge_set_org to set a session org, " +
      "or configure a default_org in ~/.amigo/config.json.",
  );
}

/**
 * Get an authenticated client for the resolved org.
 */
export function getClientForOrg(
  pool: ClientPool,
  explicitOrg?: string,
) {
  const orgId = resolveOrg(explicitOrg);
  return { orgId, client: pool.getClient(orgId) };
}

/**
 * Format a tool result as a text content block.
 */
export function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

/**
 * Format a JSON object as a tool result.
 */
export function jsonResult(data: unknown) {
  return textResult(JSON.stringify(data, null, 2));
}
