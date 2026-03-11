import assert from "node:assert/strict";
import * as fs from "node:fs";
import { test } from "node:test";
import { SERVER_VERSION } from "./server-version.js";

test("server metadata version matches package.json", () => {
  const packageJson = JSON.parse(
    fs.readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
  ) as {
    version: string;
  };

  assert.equal(SERVER_VERSION, packageJson.version);
});
