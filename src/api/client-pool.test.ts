import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { ClientPool } from "./client-pool.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("registerClient invalidates cached tokens before replacing org credentials", async () => {
  const pool = new ClientPool();
  const orgId = "acme";
  const authCalls: string[] = [];
  const serviceCalls: string[] = [];

  globalThis.fetch = async (input, init) => {
    const url = String(input);

    if (url.endsWith(`/v1/${orgId}/user/signin_with_api_key`)) {
      const apiKey = init?.headers && "X-API-KEY" in init.headers
        ? String(init.headers["X-API-KEY"])
        : "";
      authCalls.push(apiKey);

      if (apiKey === "old-key") {
        return new Response(
          JSON.stringify({
            id_token: "old-token",
            expires_at: "2099-01-01T00:00:00Z",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response("bad credentials", { status: 401 });
    }

    if (url.includes(`/v1/${orgId}/service/`)) {
      const authHeader = init?.headers && "Authorization" in init.headers
        ? String(init.headers["Authorization"])
        : "";
      serviceCalls.push(authHeader);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  };

  const oldClient = pool.registerClient(orgId, {
    api_key: "old-key",
    api_key_id: "key-id",
    user_id: "user-id",
    api_base_url: "https://api.example.com",
  });

  await oldClient.request("service/", {
    queryParams: { limit: "1" },
  });

  const replacementClient = pool.registerClient(orgId, {
    api_key: "bad-key",
    api_key_id: "key-id",
    user_id: "user-id",
    api_base_url: "https://api.example.com",
  });

  await assert.rejects(
    replacementClient.request("service/", {
      queryParams: { limit: "1" },
    }),
    /Authentication failed/,
  );

  assert.deepEqual(authCalls, ["old-key", "bad-key"]);
  assert.deepEqual(serviceCalls, ["Bearer old-token"]);
});
