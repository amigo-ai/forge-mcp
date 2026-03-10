import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const CONFIG_DIR = path.join(os.homedir(), ".amigo");
const CREDENTIALS_DIR = path.join(CONFIG_DIR, "credentials");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

export interface OrgCredentials {
  api_key: string;
  api_key_id: string;
  user_id: string;
  api_base_url: string;
}

export interface GlobalConfig {
  default_org?: string;
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function getCredentials(orgId: string): OrgCredentials | null {
  const file = path.join(CREDENTIALS_DIR, `${orgId}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf-8")) as OrgCredentials;
}

export function saveCredentials(
  orgId: string,
  creds: OrgCredentials,
): void {
  ensureDir(CREDENTIALS_DIR);
  const file = path.join(CREDENTIALS_DIR, `${orgId}.json`);
  fs.writeFileSync(file, JSON.stringify(creds, null, 2), { mode: 0o600 });
}

export function removeCredentials(orgId: string): boolean {
  const file = path.join(CREDENTIALS_DIR, `${orgId}.json`);
  if (!fs.existsSync(file)) return false;
  fs.unlinkSync(file);
  return true;
}

export function listConfiguredOrgs(): string[] {
  if (!fs.existsSync(CREDENTIALS_DIR)) return [];
  return fs
    .readdirSync(CREDENTIALS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(".json", ""));
}

export function getGlobalConfig(): GlobalConfig {
  if (!fs.existsSync(CONFIG_FILE)) return {};
  return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8")) as GlobalConfig;
}

export function saveGlobalConfig(config: GlobalConfig): void {
  ensureDir(CONFIG_DIR);
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}
