import {
  AMIGO_APP_HEADER_NAME,
  AMIGO_APP_HEADER_VALUE,
} from "../config/constants.js";
import { createLogger } from "../config/logger.js";
import type { OrgCredentials } from "../config/storage.js";
import { TokenManager } from "../auth/token-manager.js";

const log = createLogger("api");

export interface RequestOptions {
  method?: string;
  body?: unknown;
  queryParams?: Record<string, string | string[]>;
  stream?: boolean;
  timeout?: number;
  multipart?: boolean;
}

interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitterFactor: number;
  retryStatusCodes: Set<number>;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelay: 1.0,
  maxDelay: 60.0,
  backoffMultiplier: 2.0,
  jitterFactor: 0.1,
  retryStatusCodes: new Set([429, 500, 502, 503, 504]),
};

export class AmigoClient {
  private tokenManager: TokenManager;
  private retryConfig: RetryConfig;

  constructor(
    private orgId: string,
    private creds: OrgCredentials,
    tokenManager: TokenManager,
  ) {
    this.tokenManager = tokenManager;
    this.retryConfig = DEFAULT_RETRY_CONFIG;
  }

  private buildUrl(
    apiPath: string,
    queryParams?: Record<string, string | string[]>,
  ): string {
    const base = `${this.creds.api_base_url}/v1/${this.orgId}/${apiPath}`;
    if (!queryParams) return base;

    const params = new URLSearchParams();
    for (const [key, val] of Object.entries(queryParams)) {
      if (Array.isArray(val)) {
        for (const v of val) params.append(key, v);
      } else {
        params.append(key, val);
      }
    }
    return `${base}?${params.toString()}`;
  }

  private async getHeaders(): Promise<Record<string, string>> {
    const token = await this.tokenManager.getToken(this.orgId, this.creds);
    return {
      Authorization: `Bearer ${token}`,
      [AMIGO_APP_HEADER_NAME]: AMIGO_APP_HEADER_VALUE,
      "Content-Type": "application/json",
    };
  }

  private computeDelay(attempt: number): number {
    const { baseDelay, backoffMultiplier, maxDelay, jitterFactor } =
      this.retryConfig;
    let delay = baseDelay * Math.pow(backoffMultiplier, attempt - 1);
    const jitter = delay * jitterFactor * (Math.random() * 2 - 1);
    delay += jitter;
    return Math.min(delay, maxDelay);
  }

  async request<T = unknown>(
    apiPath: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const { method = "GET", body, queryParams, timeout = 30000 } = options;
    const url = this.buildUrl(apiPath, queryParams);
    const headers = await this.getHeaders();

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.retryConfig.maxAttempts; attempt++) {
      if (attempt > 0) {
        const delay = this.computeDelay(attempt);
        log.warn("Retrying request", { method, path: apiPath, attempt, delay: `${delay.toFixed(1)}s` });
        await new Promise((r) => setTimeout(r, delay * 1000));
      }

      try {
        const resp = await fetch(url, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(timeout),
        });

        if (!resp.ok) {
          if (this.retryConfig.retryStatusCodes.has(resp.status)) {
            lastError = new Error(
              `HTTP ${resp.status}: ${await resp.text()}`,
            );
            log.warn("Retryable HTTP error", { method, path: apiPath, status: resp.status, attempt });
            continue;
          }
          const errorBody = await resp.text();
          log.error("HTTP error", { method, path: apiPath, status: resp.status });
          throw new Error(`HTTP ${resp.status}: ${errorBody}`);
        }

        log.debug("Request succeeded", { method, path: apiPath, status: resp.status });
        const text = await resp.text();
        if (!text) return {} as T;
        return JSON.parse(text) as T;
      } catch (err) {
        if (
          err instanceof Error &&
          (err.name === "AbortError" || err.name === "TimeoutError")
        ) {
          log.warn("Request timeout", { method, path: apiPath, attempt, timeout });
          lastError = err;
          continue;
        }
        throw err;
      }
    }

    log.error("Request failed after all retries", { method, path: apiPath, attempts: this.retryConfig.maxAttempts + 1 });
    throw lastError ?? new Error("Request failed after retries");
  }

  async requestStream(
    apiPath: string,
    options: RequestOptions = {},
  ): Promise<AsyncIterable<string>> {
    const { method = "POST", body, queryParams, timeout = 120000, multipart = false } = options;
    const url = this.buildUrl(apiPath, queryParams);
    const headers = await this.getHeaders();

    let fetchBody: BodyInit | undefined;
    if (body && multipart) {
      const formData = new FormData();
      for (const [key, val] of Object.entries(body as Record<string, unknown>)) {
        formData.append(key, String(val));
      }
      fetchBody = formData;
      // Let fetch set the Content-Type with boundary automatically
      delete headers["Content-Type"];
    } else if (body) {
      fetchBody = JSON.stringify(body);
    }

    log.debug("Starting stream request", { method, path: apiPath });
    const resp = await fetch(url, {
      method,
      headers,
      body: fetchBody,
      signal: AbortSignal.timeout(timeout),
    });

    if (!resp.ok) {
      const errorBody = await resp.text();
      log.error("Stream request failed", { method, path: apiPath, status: resp.status });
      throw new Error(`HTTP ${resp.status}: ${errorBody}`);
    }

    if (!resp.body) {
      log.error("No response body for stream", { method, path: apiPath });
      throw new Error("No response body for stream");
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();

    return {
      async *[Symbol.asyncIterator]() {
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed) yield trimmed;
          }
        }
        if (buffer.trim()) yield buffer.trim();
      },
    };
  }

  async paginate<T>(
    apiPath: string,
    listKey: string,
    queryParams: Record<string, string | string[]> = {},
    limit = 20,
  ): Promise<T[]> {
    const items: T[] = [];
    let continuationToken: number | undefined;
    let page = 0;

    do {
      page++;
      const params: Record<string, string | string[]> = {
        ...queryParams,
        limit: String(limit),
      };
      if (continuationToken !== undefined) {
        params["continuation_token"] = String(continuationToken);
      }

      const resp = await this.request<Record<string, unknown>>(apiPath, {
        queryParams: params,
      });

      const pageItems = resp[listKey] as T[] | undefined;
      if (pageItems) items.push(...pageItems);

      continuationToken = resp["continuation_token"] as number | undefined;
      const hasMore = resp["has_more"] as boolean | undefined;
      if (!hasMore) break;
    } while (continuationToken !== undefined);

    log.debug("Pagination complete", { path: apiPath, pages: page, totalItems: items.length });
    return items;
  }
}
