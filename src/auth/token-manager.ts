import {
  AMIGO_APP_HEADER_NAME,
  AMIGO_APP_HEADER_VALUE,
} from "../config/constants.js";
import { createLogger } from "../config/logger.js";
import type { OrgCredentials } from "../config/storage.js";

const log = createLogger("auth");

interface TokenCache {
  token: string;
  expiresAt: number; // unix seconds
}

const TOKEN_BUFFER_SECONDS = 60;

export class TokenManager {
  private cache = new Map<string, TokenCache>();

  async getToken(
    orgId: string,
    creds: OrgCredentials,
  ): Promise<string> {
    const cached = this.cache.get(orgId);
    const now = Date.now() / 1000;

    if (cached && cached.expiresAt > now + TOKEN_BUFFER_SECONDS) {
      log.debug("Using cached token", { orgId, expiresIn: Math.round(cached.expiresAt - now) });
      return cached.token;
    }

    log.info("Refreshing token", { orgId, reason: cached ? "expired" : "no_cache" });
    return this.refreshToken(orgId, creds);
  }

  private async refreshToken(
    orgId: string,
    creds: OrgCredentials,
  ): Promise<string> {
    const url = `${creds.api_base_url}/v1/${orgId}/user/signin_with_api_key`;

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "X-API-KEY": creds.api_key,
        "X-API-KEY-ID": creds.api_key_id,
        "X-USER-ID": creds.user_id,
        [AMIGO_APP_HEADER_NAME]: AMIGO_APP_HEADER_VALUE,
        "Content-Type": "application/json",
      },
    });

    if (!resp.ok) {
      const body = await resp.text();
      log.error("Authentication failed", { orgId, status: resp.status });
      throw new Error(
        `Authentication failed for org "${orgId}" (${resp.status}): ${body}`,
      );
    }

    const data = (await resp.json()) as {
      id_token: string;
      expires_at: string;
    };

    const expiresAt =
      new Date(data.expires_at.replace("Z", "+00:00")).getTime() / 1000;

    this.cache.set(orgId, { token: data.id_token, expiresAt });
    log.info("Token refreshed", { orgId, expiresAt: data.expires_at });

    return data.id_token;
  }

  invalidate(orgId: string): void {
    log.info("Token invalidated", { orgId });
    this.cache.delete(orgId);
  }
}
