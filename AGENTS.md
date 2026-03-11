# Forge MCP - Agent Guidelines

This is the MCP server for the Amigo Agent Forge platform. It provides tools for managing AI agents, context graphs, services, and related entities.

## OpenAPI Reference

The official API schema is at: https://api.amigo.ai/v1/openapi.json

When adding or modifying entity schemas in `src/tools/entity-schemas.ts`, always validate field names, types, and required/optional status against the OpenAPI spec. The spec is the source of truth for request payloads.

## Architecture

- `src/tools/entity-schemas.ts` — Zod schemas for all entity create/update tool parameters
- `src/tools/entity-crud.ts` — Tool registration (entity-specific create/update + generic list/get/delete)
- `src/resources/instructions.ts` — MCP resource with agent engineering documentation
- `src/config/constants.ts` — Entity types, API paths, and response key mappings
- `src/api/client.ts` — HTTP client with retry and pagination

## Key Conventions

- Entity-specific tools are named `forge_{entity}_create` / `forge_{entity}_update`
- Generic `forge_entity_create` / `forge_entity_update` remain as fallbacks
- Agent updates have special voice_config logic (default applied on initial version only)
- POST to `{id}/` creates a new version for agents and context graphs, but updates metadata for other entities
