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

## Common Workflows

### Setting Up
1. Use forge_add_org to configure credentials for your org
2. Use forge_set_org to set the active org for the session
3. Use forge_entity_list to browse existing entities

### Creating a Service from Scratch
To deploy a working service, create the three core entities in order:

1. **Create the agent** with forge_entity_create (entity_type: "agent", data: { agent_name: "My Agent" })
2. **Create the first agent version** with forge_entity_update using the returned agent ID (see Agent Version Schema below)
3. **Create the context graph** with forge_entity_create (entity_type: "context_graph", data: { state_machine_name: "My Flow" })
4. **Create the first context graph version** with forge_entity_update using the returned context graph ID (see Context Graph Version Schema below)
5. **Create the service** with forge_entity_create (entity_type: "service") linking the agent and context graph IDs (see Service Schema below)

### Making Changes
1. Use forge_entity_get to fetch entity data
2. Modify the data as needed
3. Use forge_entity_update to push changes (creates a new version), or forge_entity_create for new entities

### Testing
1. Use forge_smoke_test to quickly test a service (single-turn, creates and finishes the conversation)
2. Use forge_simulate for multi-turn automated testing (uses recommended responses to drive the conversation)
3. Use forge_conversation_insights to debug conversation behavior (state transitions, working memory, triggered behaviors)
4. Use forge_conversation_evaluate for on-demand metric evaluation (pass metric_name, not metric_id)

### Version Management
1. Use forge_version_set_upsert to create/update version sets (note: the "edge" set is read-only and cannot be updated)
2. Use forge_version_set_promote to promote one version set to another (e.g. edge -> release, preview -> release)
3. Use forge_version_rollback to revert an agent or context_graph to a previous version

## Multi-Org
- All tools accept an optional org_id parameter
- Use forge_set_org to set a session-level default
- Use forge_list_orgs to see configured orgs

## Entity Schemas

### Agent Creation
forge_entity_create with entity_type: "agent":
\`\`\`json
{ "agent_name": "My Agent Name" }
\`\`\`

### Agent Version (forge_entity_update with entity_type: "agent")
The initial version must include ALL fields. Subsequent versions can omit fields to leave them unchanged.
\`\`\`json
{
  "initials": "MA",
  "identity": {
    "name": "Maya",
    "role": "IT Help Desk Specialist",
    "developed_by": "Acme Corp",
    "default_spoken_language": "eng",
    "relationship_to_developer": {
      "ownership": "Maya is owned and operated by Acme Corp",
      "type": "Maya is an AI assistant built by Acme Corp",
      "conversation_visibility": "Conversations may be reviewed by Acme Corp for quality assurance",
      "thought_visibility": "Internal reasoning is not visible to users"
    }
  },
  "background": "Maya is a friendly and knowledgeable IT support specialist with 5 years of experience helping employees resolve technical issues ranging from password resets to VPN troubleshooting.",
  "behaviors": [
    "Always ask clarifying questions before suggesting a solution",
    "Prioritize the simplest fix first before escalating to more complex troubleshooting",
    "Confirm the issue is resolved before closing the conversation"
  ],
  "communication_patterns": [
    "Use clear, jargon-free language unless the user demonstrates technical fluency",
    "Keep responses concise -- one question OR one statement per message, never both",
    "Mirror the user's level of urgency"
  ],
  "voice_config": null
}
\`\`\`

#### Identity Fields (all required)
- name: The agent's display name
- role: The agent's role description
- developed_by: The company/org that created the agent
- default_spoken_language: ISO 639-3 language code (e.g., "eng")
- relationship_to_developer: Object describing the agent's relationship to its creator:
  - ownership: Who owns and operates the agent
  - type: What kind of AI the agent is and who built it
  - conversation_visibility: Whether conversations are reviewed
  - thought_visibility: Whether internal reasoning is visible to users

#### voice_config
Set to null for text-only agents. For voice agents, provide: { "voice_id": "<cartesia_voice_id>" }

### Context Graph Creation
forge_entity_create with entity_type: "context_graph":
\`\`\`json
{ "state_machine_name": "My Flow" }
\`\`\`

### Context Graph Version (forge_entity_update with entity_type: "context_graph")
All fields are required.
\`\`\`json
{
  "description": "A simple IT support flow that greets the user, diagnoses their issue, and resolves it.",
  "new_user_initial_state": "greeting",
  "returning_user_initial_state": "greeting",
  "terminal_state": "wrap_up",
  "references": {},
  "global_intra_state_navigation_guidelines": [],
  "global_action_guidelines": [],
  "global_boundary_constraints": [
    "Never attempt to fix issues outside of IT support scope",
    "Never ask for passwords or sensitive credentials"
  ],
  "states": [
    {
      "type": "action",
      "name": "greeting",
      "objective": "Greet the user and understand what they need help with",
      "actions": [
        "Welcome the user warmly",
        "Ask what IT issue they are experiencing"
      ],
      "intra_state_navigation_guidelines": [],
      "action_guidelines": [
        "If returning user, acknowledge their return"
      ],
      "boundary_constraints": [],
      "exit_conditions": [
        {
          "description": "User has described their IT issue",
          "next_state": "diagnose"
        }
      ],
      "action_tool_call_specs": [],
      "exit_condition_tool_call_specs": [],
      "skip_active_memory_retrieval": false
    },
    {
      "type": "action",
      "name": "diagnose",
      "objective": "Diagnose the user's IT issue and provide a resolution",
      "actions": [
        "Ask targeted questions to narrow down the problem",
        "Suggest the simplest potential fix first",
        "Walk the user through troubleshooting steps"
      ],
      "intra_state_navigation_guidelines": [
        "Start with the most common cause and work toward less likely ones"
      ],
      "action_guidelines": [
        "Confirm the user has tried basic steps (restart, check connections) before advanced troubleshooting"
      ],
      "boundary_constraints": [
        "Do not suggest solutions that require admin-level access without confirming the user has it"
      ],
      "exit_conditions": [
        {
          "description": "Issue is resolved or user confirms the fix worked",
          "next_state": "wrap_up"
        },
        {
          "description": "Issue requires escalation beyond self-service",
          "next_state": "wrap_up"
        }
      ],
      "action_tool_call_specs": [],
      "exit_condition_tool_call_specs": [],
      "skip_active_memory_retrieval": false
    },
    {
      "type": "action",
      "name": "wrap_up",
      "objective": "Close the conversation and confirm satisfaction",
      "actions": [
        "Summarize what was done, ask if there is anything else, and say goodbye"
      ],
      "intra_state_navigation_guidelines": [],
      "action_guidelines": [],
      "boundary_constraints": [],
      "exit_conditions": [],
      "action_tool_call_specs": [],
      "exit_condition_tool_call_specs": [],
      "skip_active_memory_retrieval": false
    }
  ]
}
\`\`\`

#### Important Constraints
- The terminal state MUST have exactly one action (combine multiple actions into a single string)
- All state names referenced in exit_conditions must exist in the states array

#### State Types

**Action State** (type: "action") -- The primary state type. The agent engages with the user and produces a user-facing message.
Required fields: type, name, objective, actions (array, min 1 item), intra_state_navigation_guidelines, action_guidelines, boundary_constraints, exit_conditions, action_tool_call_specs, exit_condition_tool_call_specs, skip_active_memory_retrieval

**Decision State** (type: "decision") -- The agent silently evaluates which state to go to next based on context. No user-facing message is produced. Use this for routing logic (e.g., "is this a billing issue or a technical issue?").
Required fields: type, name, objective, exit_conditions, decision_guidelines, tool_call_specs, audio_fillers (array, max 5), audio_filler_triggered_after (number, 0-10 seconds)
\`\`\`json
{
  "type": "decision",
  "name": "route_issue",
  "objective": "Determine the category of the user's issue",
  "decision_guidelines": [
    "If the user mentions passwords, accounts, or login -> account_support",
    "If the user mentions hardware, peripherals, or physical equipment -> hardware_support",
    "For all other issues -> general_support"
  ],
  "exit_conditions": [
    { "description": "Issue is account-related", "next_state": "account_support" },
    { "description": "Issue is hardware-related", "next_state": "hardware_support" },
    { "description": "Issue is general", "next_state": "general_support" }
  ],
  "tool_call_specs": [],
  "audio_fillers": [],
  "audio_filler_triggered_after": 3
}
\`\`\`

**Recall State** (type: "recall") -- Retrieves information from user memory before proceeding. No user-facing message. Use this to pull in stored user context (e.g., past issues, preferences) before an action state.
Required fields: type, name, queries (array of search strings, or null), requested_information (description of what to retrieve, or null), next_state
\`\`\`json
{
  "type": "recall",
  "name": "recall_user_history",
  "queries": ["previous IT issues", "device information"],
  "requested_information": "The user's past IT support interactions and known device setup",
  "next_state": "diagnose"
}
\`\`\`

**Annotation State** (type: "annotation") -- Injects a fixed inner thought into the agent's context before proceeding. No user-facing message. Use this to prime the agent with specific instructions or context that should influence the next state.
Required fields: type, name, inner_thought, next_state
\`\`\`json
{
  "type": "annotation",
  "name": "set_urgency_context",
  "inner_thought": "The user indicated this is blocking their work. Prioritize speed over thoroughness and suggest the fastest resolution path.",
  "next_state": "diagnose"
}
\`\`\`

**Reflection State** (type: "reflection") -- The agent silently reasons about a problem before proceeding. No user-facing message. Use this for complex analysis where the agent needs to think through a situation before acting.
Required fields: type, name, problem, word_limit (positive integer), next_state, tool_call_specs, audio_fillers (array, max 5), audio_filler_triggered_after (number, 0-10 seconds)
\`\`\`json
{
  "type": "reflection",
  "name": "analyze_symptoms",
  "problem": "Based on the symptoms described, determine the most likely root cause and the optimal troubleshooting sequence",
  "word_limit": 200,
  "next_state": "diagnose",
  "tool_call_specs": [],
  "audio_fillers": [],
  "audio_filler_triggered_after": 3
}
\`\`\`

**Tool Call State** (type: "tool-call") -- Executes a specific tool and proceeds to the next state. No user-facing message. Use this when a specific tool must be called at a specific point in the flow (e.g., looking up a record before presenting options).
Required fields: type, name, next_state, designated_tool (ToolCallSpec), designated_tool_call_objective, designated_tool_call_context, designated_tool_call_guidances, designated_tool_call_validations, designated_tool_call_params_generation_audio_fillers (array, max 5), designated_tool_call_params_generation_audio_filler_triggered_after (number, 0-10 seconds), tool_call_specs
\`\`\`json
{
  "type": "tool-call",
  "name": "lookup_user_account",
  "next_state": "present_account_info",
  "designated_tool": {
    "tool_id": "<tool_id>",
    "version_constraint": ">=1",
    "additional_instruction": "Look up the user by their email address",
    "audio_fillers": ["Let me look that up for you"],
    "audio_filler_triggered_after": 2,
    "result_persistence": "persisted-preferred"
  },
  "designated_tool_call_objective": "Retrieve the user's account details",
  "designated_tool_call_context": "The user needs help with their account and we need to look up their information",
  "designated_tool_call_guidances": ["Use the email address provided by the user"],
  "designated_tool_call_validations": ["Ensure the email address is in a valid format before calling"],
  "designated_tool_call_params_generation_audio_fillers": [],
  "designated_tool_call_params_generation_audio_filler_triggered_after": 3,
  "tool_call_specs": []
}
\`\`\`

#### ToolCallSpec
Used in action_tool_call_specs, exit_condition_tool_call_specs, tool_call_specs, and designated_tool fields to reference tools:
\`\`\`json
{
  "tool_id": "<24-char hex ID of the tool>",
  "version_constraint": ">=1",
  "additional_instruction": "Extra context for the LLM when using this tool",
  "audio_fillers": ["One moment please"],
  "audio_filler_triggered_after": 2,
  "result_persistence": "persisted-preferred"
}
\`\`\`
result_persistence options: "ephemeral" (current interaction only), "persisted-preferred" (kept if < 5000 chars), "persisted" (always kept, errors if > 5000 chars)

#### Exit Conditions
Each exit condition has:
- description: When this transition should fire
- next_state: Name of the target state (must be a state in this graph or a reference)

### Service Creation (forge_entity_create with entity_type: "service")
All fields are required.
\`\`\`json
{
  "agent_id": "<agent_id from step 1>",
  "service_hierarchical_state_machine_id": "<context_graph_id from step 3>",
  "name": "My Service",
  "description": "A brief description of what this service does",
  "is_active": true,
  "keyterms": [],
  "tags": {}
}
\`\`\`

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
Entity data must use ASCII-only characters:
- Bullets: * or - (not unicode bullets)
- Dashes: -- or - (not em/en dashes)
- Quotes: " and ' (not smart quotes)
- Arrows: -> (not unicode arrows)
- Ellipsis: ... (not unicode ellipsis)

## Tips and Constraints

### Entity Creation
- Agent creation requires \`agent_name\` (not \`name\`) in the data payload
- Context graph creation requires \`state_machine_name\` (not \`name\`)
- Service creation requires \`agent_id\` and \`service_hierarchical_state_machine_id\`

### Entity Updates
- The initial version of an agent must include ALL fields (initials, identity, background, behaviors, communication_patterns, voice_config)
- Subsequent versions can include only changed fields

### Version Sets
- The "edge" version set is read-only and always tracks the latest versions automatically -- it cannot be updated via forge_version_set_upsert
- Use "preview" or "release" as target set names for forge_version_set_upsert
- forge_version_set_promote copies the pinned versions from source to target (e.g. edge -> release pins release to whatever edge currently points to)

### Conversation Testing
- forge_smoke_test creates a conversation, sends one message, and finishes the conversation -- good for quick sanity checks
- forge_simulate uses the recommend_responses API to generate realistic user messages for multi-turn testing
- forge_conversation_insights shows state transitions, working memory, and triggered dynamic behaviors for debugging
- forge_conversation_evaluate accepts a metric name (not ID) -- the tool resolves the name to an ID automatically
`;


export function registerResources(server: McpServer): void {
  server.resource(
    "dependency-order",
    "amigo://dependency-order",
    {
      description:
        "Entity dependency order -- create/update entities in this sequence to satisfy references.",
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
}
