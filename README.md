# @amigo-ai/forge-tools

MCP server that gives coding agents (Claude Code, Codex, Cursor, etc.) full access to the [Amigo](https://amigo.ai) Agent Forge platform -- manage AI agents, context graphs, services, conversations, and more.

## Installation

Add to your `.mcp.json` (Claude Code, Cursor, etc.):

**Via npx (after npm publish):**

```json
{
  "mcpServers": {
    "forge": {
      "command": "npx",
      "args": ["-y", "@amigo-ai/forge-tools"]
    }
  }
}
```

**From GitHub:**

```json
{
  "mcpServers": {
    "forge": {
      "command": "npx",
      "args": ["-y", "github:amigo-ai/forge-mcp"]
    }
  }
}
```

**From a local clone:**

```bash
git clone git@github.com:amigo-ai/forge-mcp.git
cd forge-mcp
npm install && npm run build
```

```json
{
  "mcpServers": {
    "forge": {
      "command": "node",
      "args": ["/absolute/path/to/forge-mcp/dist/index.js"]
    }
  }
}
```

## Credentials

Credentials are managed per-org and stored at `~/.amigo/credentials/{org_id}.json`. There are two ways to set them up:

### Interactive setup (recommended)

Start the server with no env vars. On first use, ask your coding agent to add each org:

```
> Use forge_add_org to add credentials for org "acme"
> Use forge_add_org to add credentials for org "acme-staging"
```

The tool validates credentials by signing in, then persists them for future sessions. You only do this once per org.

### Bootstrap via environment variables

You can bootstrap a single org's credentials via env vars for convenience (e.g., in CI or for initial setup):

```json
{
  "mcpServers": {
    "forge": {
      "command": "npx",
      "args": ["-y", "@amigo-ai/forge-tools"],
      "env": {
        "AMIGO_ORG_ID": "your-org",
        "AMIGO_API_KEY": "your-api-key",
        "AMIGO_API_KEY_ID": "your-api-key-id",
        "AMIGO_USER_ID": "your-user-id"
      }
    }
  }
}
```

This auto-authenticates and persists the credentials on startup. Additional orgs can then be added via `forge_add_org`.

## Multi-Org Support

The server manages multiple orgs simultaneously. All tools accept an optional `org_id` parameter, resolved via this fallback chain:

1. Explicit `org_id` argument on the tool call
2. Session org (set via `forge_set_org`)
3. Default org in `~/.amigo/config.json`

```
> forge_add_org org_id="acme" api_key="..." api_key_id="..." user_id="..."
> forge_add_org org_id="acme-staging" api_key="..." api_key_id="..." user_id="..."
> forge_set_org org_id="acme-staging"        # set session default
> forge_entity_list entity_type="agent"      # uses "acme-staging"
> forge_entity_list entity_type="agent" org_id="acme"  # override for one call
```

## Tools

### Org Management

| Tool | Description |
|------|-------------|
| `forge_set_org` | Set the active org for the session |
| `forge_list_orgs` | List all configured orgs with auth status |
| `forge_add_org` | Add/update credentials for an org (validates by signing in) |
| `forge_remove_org` | Remove stored credentials |

### Entity CRUD

| Tool | Description |
|------|-------------|
| `forge_entity_list` | List all entities of a type |
| `forge_entity_get` | Get full entity details by ID |
| `forge_entity_create` | Create a new entity |
| `forge_entity_update` | Update an entity (creates a new version) |
| `forge_entity_delete` | Delete an entity |

Supported entity types: `agent`, `context_graph`, `service`, `dynamic_behavior_set`, `tool`, `persona`, `scenario`, `metric`, `unit_test`, `unit_test_set`, `user_dimension`

### Conversation Testing

| Tool | Description |
|------|-------------|
| `forge_smoke_test` | Quick single-turn test against a service |
| `forge_simulate` | Multi-turn automated simulation |
| `forge_conversation_insights` | Get state transitions, triggered behaviors, working memory |
| `forge_conversation_evaluate` | Run on-demand metric evaluation |

### Version Management

| Tool | Description |
|------|-------------|
| `forge_version_set_list` | List version sets for a service |
| `forge_version_set_upsert` | Create/update a version set |
| `forge_version_set_promote` | Promote one version set to another (e.g. preview -> release) |
| `forge_version_rollback` | Roll back an entity to a previous version |

### Validation

| Tool | Description |
|------|-------------|
| `forge_validate` | Check entity data for structural issues |
| `forge_prompt_lint` | Detect unicode characters that degrade LLM output quality |

## MCP Resources

The server exposes resources that give coding agents contextual knowledge:

- `amigo://instructions` -- Agent engineering principles, workflows, and best practices
- `amigo://dependency-order` -- Entity dependency order to satisfy references

## Environment Variables

All optional. Used only to bootstrap a single org on startup -- use `forge_add_org` for additional orgs.

| Variable | Description |
|----------|-------------|
| `AMIGO_ORG_ID` | Org to bootstrap and set as session default |
| `AMIGO_API_KEY` | API key for the bootstrapped org |
| `AMIGO_API_KEY_ID` | API key identifier |
| `AMIGO_USER_ID` | User ID |
| `AMIGO_API_BASE_URL` | API base URL (default: `https://api.amigo.ai`) |

## Development

```bash
npm install
npm run build       # compile TypeScript
npm run dev         # compile in watch mode
npm start           # run the server
```

