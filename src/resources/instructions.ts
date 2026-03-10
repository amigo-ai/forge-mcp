import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ENTITY_SYNC_ORDER } from "../config/constants.js";

const INSTRUCTIONS = `# Agent Forge MCP -- Instructions for Coding Agents

You have access to the Amigo Agent Forge platform via MCP tools. Use these tools to manage AI agents, context graphs, services, and conversations.

## Core Concepts

- **Agent**: The AI persona (identity, background, behaviors, communication patterns)
- **Context Graph**: The state machine that defines conversation flow (states, transitions, exit conditions)
- **Service**: Links an agent + context graph together into a deployable unit
- **Dynamic Behavior Set**: Runtime instructions injected based on triggers (e.g., user frustration, time of day)
- **Tool**: External actions the agent can invoke (API calls, data retrieval)
- **User Dimension**: Memory categories for tracking user patterns across conversations
- **Version Set**: Named snapshot of pinned versions (e.g., "preview", "release")

## Entity Dependency Order (sync in this sequence)

${ENTITY_SYNC_ORDER.map((e, i) => `${i + 1}. ${e}`).join("\n")}

## Common Workflows

### Setting Up
1. Use forge_add_org to configure credentials for your org
2. Use forge_set_org to set the active org for the session
3. Use forge_stl to pull existing entities locally

### Making Changes
1. Edit local JSON files in ./local/{org}/entity_data/{entity_type}/
2. Use forge_prompt_lint to check for unicode issues
3. Use forge_validate to check for structural issues
4. Use forge_str with apply=true to push changes

### Testing
1. Use forge_smoke_test to quickly test a service
2. Use forge_simulate for multi-turn automated testing
3. Use forge_conversation_insights to debug conversation behavior
4. Use forge_conversation_evaluate for on-demand metric evaluation

### Version Management
1. Use forge_version_set_upsert to create/update version sets
2. Use forge_version_set_promote to promote preview -> release
3. Use forge_version_rollback to revert to a previous version

## Multi-Org
- All tools accept an optional org_id parameter
- Use forge_set_org to set a session-level default
- Use forge_list_orgs to see configured orgs
- Use forge_cross_env_sync to sync entities between orgs

## Agent Engineering Principles

### The Optimization Problem
Every agent interaction is a constrained optimization problem. Priorities in order:
1. Quality (don't rush)
2. Action Guidelines (stay in scope)
3. Behavioral Guidelines (core behaviors)
4. Communication Patterns (style and voice)
5. Objective Progress (move toward goal)
6. Action Direction (suggested path)

### The 70-80% Rule
A well-designed agent handles 70-80% of behavioral decisions through its core identity alone.
The context graph handles the remaining 20-30%.

### Key Design Principles
- Start with comprehensive guidelines, then systematically delete what's irrelevant
- Define WHAT to do, not HOW (keep actions high-level)
- Boundary constraints are more important than action guidelines
- Test on weaker LLMs to reveal design problems
- One question OR one statement per response, never both

### Prompt Template Rules
Entity data files must use ASCII-only characters:
- Bullets: * or - (not unicode bullets)
- Dashes: -- or - (not em/en dashes)
- Quotes: " and ' (not smart quotes)
- Arrows: -> (not unicode arrows)
- Ellipsis: ... (not unicode ellipsis)

Use forge_prompt_lint to check and fix these automatically.
`;

export function registerResources(server: McpServer): void {
  server.resource(
    "instructions",
    "amigo://instructions",
    {
      description:
        "Complete Agent Forge instructions for coding agents, including workflows, principles, and best practices.",
      mimeType: "text/markdown",
    },
    async () => ({
      contents: [
        {
          uri: "amigo://instructions",
          mimeType: "text/markdown",
          text: INSTRUCTIONS,
        },
      ],
    }),
  );

  server.resource(
    "dependency-order",
    "amigo://dependency-order",
    {
      description:
        "Entity sync dependency order -- sync entities in this sequence to satisfy references.",
      mimeType: "text/plain",
    },
    async () => ({
      contents: [
        {
          uri: "amigo://dependency-order",
          mimeType: "text/plain",
          text: ENTITY_SYNC_ORDER.map((e, i) => `${i + 1}. ${e}`).join(
            "\n",
          ),
        },
      ],
    }),
  );
}
