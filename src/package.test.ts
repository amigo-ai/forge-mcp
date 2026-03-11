import assert from "node:assert/strict";
import * as fs from "node:fs";
import { test } from "node:test";

test("package.json builds dist during git-based installs", () => {
  const packageJson = JSON.parse(
    fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as {
    scripts?: Record<string, string>;
  };

  assert.equal(packageJson.scripts?.prepare, "npm run build");
});

test("package.json only publishes the built artifact and readme", () => {
  const packageJson = JSON.parse(
    fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as {
    files?: string[];
  };

  assert.deepEqual(packageJson.files, ["dist", "README.md"]);
});
