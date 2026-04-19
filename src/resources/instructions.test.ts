import assert from "node:assert/strict";
import { test } from "node:test";
import { registerResources } from "./instructions.js";

test("instructions tell callers to omit unknown agent voice_config values", async () => {
  let instructionsHandler:
    | (() => Promise<{ contents: Array<{ text?: string }> }>)
    | undefined;

  const server = {
    resource(
      name: string,
      _uri: string,
      _metadata: Record<string, unknown>,
      handler: () => Promise<{ contents: Array<{ text?: string }> }>,
    ) {
      if (name === "instructions") {
        instructionsHandler = handler;
      }
    },
  };

  registerResources(server as never);
  const handler = instructionsHandler;
  assert.ok(handler, "instructions resource should be registered");
  const result = await handler();
  const instructionsText = result.contents[0]?.text ?? "";

  assert.match(
    instructionsText,
    /omit voice_config and the MCP will apply the built-in default voice for the initial agent version/u,
  );
  assert.match(
    instructionsText,
    /omit voice_config to leave the existing voice unchanged/u,
  );
  assert.doesNotMatch(
    instructionsText,
    /Required fields: initials, identity, background, behaviors, communication_patterns, voice_config/u,
  );
});
