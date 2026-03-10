# @amigo-ai/forge-tools

MCP server that gives coding agents (Claude Code, Codex, Cursor, etc.) full access to the [Amigo](https://amigo.ai) Agent Forge platform -- manage AI agents, context graphs, services, conversations, and more.

## Installation

### Via npx (after npm publish)

No install needed -- add directly to your `.mcp.json` (Claude Code, Cursor, etc.):

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

### From GitHub

Install directly from the repository without waiting for an npm publish:

```json
{
  "mcpServers": {
    "forge": {
      "command": "npx",
      "args": ["-y", "github:amigo-ai/forge-mcp"],
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

### From a local clone

```bash
git clone git@github.com:amigo-ai/forge-mcp.git
cd forge-mcp
npm install && npm run build
```

Then point your `.mcp.json` at the built output:

```json
{
  "mcpServers": {
    "forge": {
      "command": "node",
      "args": ["/absolute/path/to/forge-mcp/dist/index.js"],
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

### Credentials

You can provide credentials in two ways:

1. **Environment variables** (shown above) -- the server authenticates and persists credentials automatically on startup.
2. **Interactive setup** -- omit the `env` block and ask your coding agent to run `forge_add_org` with your credentials. They'll be validated and saved to `~/.amigo/credentials/{org_id}.json` for future sessions.

## Multi-Org Support

All tools accept an optional `org_id` parameter. When omitted, the org is resolved via this fallback chain:

1. Explicit `org_id` argument on the tool call
2. Session org (set via `forge_set_org`)
3. Default org in `~/.amigo/config.json`

This means you can work across multiple orgs in a single session:

```
> forge_set_org org_id="staging"     # set default for this session
> forge_entity_list entity_type="agent"  # uses "staging"
> forge_entity_list entity_type="agent" org_id="production"  # override for one call
```

Credentials are stored per-org at `~/.amigo/credentials/{org_id}.json`.

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

### Sync (STL/STR)

| Tool | Description |
|------|-------------|
| `forge_stl` | Pull entities from remote API to local JSON files |
| `forge_str` | Push local JSON files to remote API |
| `forge_cross_env_sync` | Sync entities between two orgs |

All sync operations are **dry-run by default** -- pass `apply=true` to execute.

Local files are stored at `./local/{org_id}/entity_data/{entity_type}/`.

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
| `forge_validate` | Check local entity files for structural issues |
| `forge_prompt_lint` | Detect unicode characters that degrade LLM output quality |

## MCP Resources

The server exposes resources that give coding agents contextual knowledge:

- `amigo://instructions` -- Agent engineering principles, workflows, and best practices
- `amigo://dependency-order` -- Entity sync ordering to satisfy references

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AMIGO_ORG_ID` | No | Default org ID |
| `AMIGO_API_KEY` | No | API key (used with org ID for auto-setup) |
| `AMIGO_API_KEY_ID` | No | API key identifier |
| `AMIGO_USER_ID` | No | User ID |
| `AMIGO_API_BASE_URL` | No | API base URL (default: `https://api.amigo.ai`) |

When all four credential variables are set alongside `AMIGO_ORG_ID`, the server automatically authenticates and persists credentials on startup.

## Development

```bash
npm install
npm run build       # compile TypeScript
npm run dev         # compile in watch mode
npm start           # run the server
```

## Entity Dependency Order

When syncing entities, follow this order to satisfy references:

1. `agent`
2. `context_graph`
3. `service` (requires agent + context_graph)
4. `tool`
5. `dynamic_behavior_set` (requires service)
6. `user_dimension`
7. `persona`
8. `scenario`
9. `metric`
10. `unit_test`
11. `unit_test_set`
