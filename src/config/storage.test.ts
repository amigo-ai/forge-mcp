import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, test } from "node:test";

const originalHome = process.env["HOME"];

afterEach(() => {
  if (originalHome === undefined) {
    delete process.env["HOME"];
    return;
  }

  process.env["HOME"] = originalHome;
});

async function loadStorageModule(tempHome: string) {
  process.env["HOME"] = tempHome;
  return import(new URL(`./storage.js?home=${encodeURIComponent(tempHome)}`, import.meta.url).href);
}

test("saveCredentials stores data under the configured home directory", async () => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "forge-storage-test-"));

  try {
    const storage = await loadStorageModule(tempHome);
    const creds = {
      api_key: "key",
      api_key_id: "key-id",
      user_id: "user-id",
      api_base_url: "https://api.example.com",
    };

    storage.saveCredentials("acme", creds);

    const credentialFile = path.join(tempHome, ".amigo", "credentials", "acme.json");
    assert.equal(fs.existsSync(credentialFile), true);
    assert.deepEqual(storage.getCredentials("acme"), creds);
    assert.deepEqual(storage.listConfiguredOrgs(), ["acme"]);
    assert.equal(storage.removeCredentials("acme"), true);
    assert.equal(fs.existsSync(credentialFile), false);
  } finally {
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
});

test("credential storage rejects org IDs with path separators", async () => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "forge-storage-test-"));

  try {
    const storage = await loadStorageModule(tempHome);
    const creds = {
      api_key: "key",
      api_key_id: "key-id",
      user_id: "user-id",
      api_base_url: "https://api.example.com",
    };

    assert.throws(() => storage.saveCredentials("../escape", creds), /path separators/i);
    assert.throws(() => storage.getCredentials("../escape"), /path separators/i);
    assert.throws(() => storage.removeCredentials("nested/org"), /path separators/i);
    assert.throws(() => storage.assertValidOrgId("nested\\org"), /path separators/i);
    assert.equal(fs.existsSync(path.join(tempHome, ".amigo")), false);
  } finally {
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
});

test("credential storage rejects empty org IDs", async () => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "forge-storage-test-"));

  try {
    const storage = await loadStorageModule(tempHome);
    assert.throws(() => storage.assertValidOrgId("   "), /cannot be empty/i);
  } finally {
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
});
