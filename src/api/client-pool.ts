import { AmigoClient } from "./client.js";
import { TokenManager } from "../auth/token-manager.js";
import {
  getCredentials,
  type OrgCredentials,
} from "../config/storage.js";

/**
 * Manages one AmigoClient per org_id. Lazily initializes clients
 * on first request to each org.
 */
export class ClientPool {
  private clients = new Map<string, AmigoClient>();
  private tokenManager = new TokenManager();

  getClient(orgId: string): AmigoClient {
    const existing = this.clients.get(orgId);
    if (existing) return existing;

    const creds = getCredentials(orgId);
    if (!creds) {
      throw new Error(
        `No credentials found for org "${orgId}". ` +
          `Use the forge_add_org tool to configure credentials, or set ` +
          `AMIGO_ORG_ID, AMIGO_API_KEY, AMIGO_API_KEY_ID, and AMIGO_USER_ID environment variables.`,
      );
    }

    const client = new AmigoClient(orgId, creds, this.tokenManager);
    this.clients.set(orgId, client);
    return client;
  }

  /** Register credentials directly (e.g. from env vars) without persisting. */
  registerClient(orgId: string, creds: OrgCredentials): AmigoClient {
    const client = new AmigoClient(orgId, creds, this.tokenManager);
    this.clients.set(orgId, client);
    return client;
  }

  removeClient(orgId: string): void {
    this.clients.delete(orgId);
    this.tokenManager.invalidate(orgId);
  }
}
