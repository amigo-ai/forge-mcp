# @amigo-ai/forge-tools

[![npm version](https://img.shields.io/npm/v/%40amigo-ai%2Fforge-tools?logo=npm)](https://www.npmjs.com/package/@amigo-ai/forge-tools)
[![Publish](https://github.com/amigo-ai/forge-mcp/actions/workflows/publish.yml/badge.svg)](https://github.com/amigo-ai/forge-mcp/actions/workflows/publish.yml)

Prototype MCP server for Amigo Agent Forge workflows.

This package gives coding agents access to current Amigo Agent Forge operations: managing org credentials, reading and mutating entity configurations, running conversation tests, and working with version sets from Claude Code, Codex, Cursor, and other MCP clients.

## Documentation

- [Product Docs](https://docs.amigo.ai)
- [GitHub Issues](https://github.com/amigo-ai/forge-mcp/issues)
- [Contributing](https://github.com/amigo-ai/forge-mcp/blob/main/CONTRIBUTING.md)
- [Security](https://github.com/amigo-ai/forge-mcp/blob/main/SECURITY.md)

## Status

`@amigo-ai/forge-tools` is a prototype product under active development.

- Expect rough edges and changing tool contracts
- Treat the current MCP surface as experimental, not a long-term stability guarantee
- Use it for evaluation and early workflows, not as a fully locked production integration surface

As equivalent platform-native management surfaces mature, Amigo will publish the longer-term path for MCP users. This repo is intentionally positioned as an early prototype today.

## Choose The Right Tool

| If you need | Use |
| --- | --- |
| An experimental MCP-driven Agent Forge prototype for coding agents | `@amigo-ai/forge-tools` |
| Direct typed application access to the Platform API | [`@amigo-ai/platform-sdk`](https://github.com/amigo-ai/amigo-platform-typescript-sdk) |

## Installation

Add the server to your MCP configuration.

### Via npm

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

### From GitHub

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

### From A Local Clone

```bash
git clone git@github.com:amigo-ai/forge-mcp.git
cd forge-mcp
npm install
npm run build
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

Credentials are stored per org in `~/.amigo/credentials/{org_id}.json`.

### Recommended Flow

Start the server without environment variables, then ask your coding agent to add org credentials:

```text
Use forge_add_org to add credentials for org "acme"
Use forge_add_org to add credentials for org "acme-staging"
```

The tool validates credentials by signing in before saving them.

### Bootstrap With Environment Variables

You can bootstrap one org on startup:

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

## What Your Agent Can Do

- Add, remove, list, and switch active org credentials
- Create, update, read, list, and delete Agent Forge entity types
- Run smoke tests and multi-turn simulations
- Inspect conversation insights and evaluations
- Manage version sets and rollbacks

## Multi-Org Support

All tools accept an optional `org_id`. Resolution order is:

1. Explicit `org_id` on the tool call
2. Session org set by `forge_set_org`
3. Default org in `~/.amigo/config.json`

## Tool Catalog

### Org Management

| Tool | Description |
| --- | --- |
| `forge_set_org` | Set the active org for the session |
| `forge_list_orgs` | List configured orgs with auth status |
| `forge_add_org` | Add or update credentials for an org |
| `forge_remove_org` | Remove stored credentials |

### Entity CRUD

| Tool | Description |
| --- | --- |
| `forge_entity_list` | List entities of a type |
| `forge_entity_get` | Get full entity details |
| `forge_entity_create` | Create a new entity |
| `forge_entity_update` | Update an entity |
| `forge_entity_delete` | Delete an entity |

Supported entity types: `agent`, `context_graph`, `service`, `dynamic_behavior_set`, `tool`, `persona`, `scenario`, `metric`, `unit_test`, `unit_test_set`, `user_dimension`

### Conversation Testing

| Tool | Description |
| --- | --- |
| `forge_smoke_test` | Quick single-turn test against a service |
| `forge_simulate` | Multi-turn automated simulation |
| `forge_conversation_insights` | Inspect state transitions and memory |
| `forge_conversation_evaluate` | Run on-demand metric evaluation |

### Version Management

| Tool | Description |
| --- | --- |
| `forge_version_set_list` | List version sets for a service |
| `forge_version_set_upsert` | Create or update a version set |
| `forge_version_set_promote` | Promote one version set to another |
| `forge_version_rollback` | Roll back an entity to a previous version |

## MCP Resources

- `amigo://instructions` for Agent Forge guidance
- `amigo://dependency-order` for entity dependency ordering

## Environment Variables

All variables are optional and only apply to startup bootstrap:

| Variable | Description |
| --- | --- |
| `AMIGO_ORG_ID` | Org to bootstrap and set as session default |
| `AMIGO_API_KEY` | API key for the bootstrapped org |
| `AMIGO_API_KEY_ID` | API key identifier |
| `AMIGO_USER_ID` | User ID |
| `AMIGO_API_BASE_URL` | API base URL. Defaults to `https://api.amigo.ai` |
| `FORGE_LOG_LEVEL` | Log verbosity: `debug`, `info`, `warn`, `error` |

## Development

```bash
npm install
npm run build
npm run lint
npm test
```
