import { z } from "zod";

// ── Reusable sub-schemas ──

const relationshipToDeveloperSchema = z.object({
  ownership: z.string().describe("Who owns and operates the agent"),
  type: z.string().describe("What kind of AI the agent is and who built it"),
  conversation_visibility: z
    .string()
    .describe("Whether conversations are reviewed"),
  thought_visibility: z
    .string()
    .describe("Whether internal reasoning is visible to users"),
});

const identitySchema = z.object({
  name: z.string().describe("The agent's display name"),
  role: z.string().describe("The agent's role description"),
  developed_by: z
    .string()
    .describe("Company/org that created the agent"),
  default_spoken_language: z
    .string()
    .describe("ISO 639-3 language code (e.g., 'eng')"),
  relationship_to_developer: relationshipToDeveloperSchema,
});

const voiceConfigSchema = z
  .object({ voice_id: z.string().describe("Cartesia voice ID") })
  .optional()
  .describe(
    "Voice config. Omit to use the default voice on initial version, or to keep existing voice on updates.",
  );

const toolCallSpecSchema = z.object({
  tool_id: z.string().describe("24-char hex ID of the tool"),
  version_constraint: z
    .string()
    .describe('Version constraint (e.g., ">=1")'),
  additional_instruction: z
    .string()
    .describe("Extra context for the LLM when using this tool"),
  audio_fillers: z.array(z.string()),
  audio_filler_triggered_after: z.number(),
  result_persistence: z
    .enum(["ephemeral", "persisted-preferred", "persisted"])
    .describe(
      "ephemeral = current interaction only, persisted-preferred = kept if < 5000 chars, persisted = always kept",
    ),
});

const exitConditionSchema = z.object({
  description: z.string().describe("When this transition should fire"),
  next_state: z.string().describe("Name of the target state"),
});

// ── Context graph state types ──

const actionStateSchema = z.object({
  type: z.literal("action"),
  name: z.string().describe("Unique state name"),
  objective: z.string().describe("What the agent should accomplish in this state"),
  actions: z.array(z.string()).min(1).describe("Actions the agent should take"),
  intra_state_navigation_guidelines: z.array(z.string()),
  action_guidelines: z.array(z.string()),
  boundary_constraints: z.array(z.string()),
  exit_conditions: z.array(exitConditionSchema),
  action_tool_call_specs: z.array(toolCallSpecSchema),
  exit_condition_tool_call_specs: z.array(toolCallSpecSchema),
  skip_active_memory_retrieval: z.boolean(),
});

const decisionStateSchema = z.object({
  type: z.literal("decision"),
  name: z.string().describe("Unique state name"),
  objective: z.string(),
  decision_guidelines: z.array(z.string()).describe("Rules for choosing the next state"),
  exit_conditions: z.array(exitConditionSchema),
  tool_call_specs: z.array(toolCallSpecSchema),
  audio_fillers: z.array(z.string()).max(5),
  audio_filler_triggered_after: z.number().min(0).max(10),
});

const recallStateSchema = z.object({
  type: z.literal("recall"),
  name: z.string().describe("Unique state name"),
  queries: z.array(z.string()).nullable().describe("Search queries for user memory"),
  requested_information: z.string().nullable().describe("Description of what to retrieve"),
  next_state: z.string(),
});

const annotationStateSchema = z.object({
  type: z.literal("annotation"),
  name: z.string().describe("Unique state name"),
  inner_thought: z.string().describe("Fixed inner thought injected into context"),
  next_state: z.string(),
});

const reflectionStateSchema = z.object({
  type: z.literal("reflection"),
  name: z.string().describe("Unique state name"),
  problem: z.string().describe("Problem for the agent to reason about"),
  word_limit: z.number().int().positive(),
  next_state: z.string(),
  tool_call_specs: z.array(toolCallSpecSchema),
  audio_fillers: z.array(z.string()).max(5),
  audio_filler_triggered_after: z.number().min(0).max(10),
});

const toolCallStateSchema = z.object({
  type: z.literal("tool-call"),
  name: z.string().describe("Unique state name"),
  next_state: z.string(),
  designated_tool: toolCallSpecSchema,
  designated_tool_call_objective: z.string(),
  designated_tool_call_context: z.string(),
  designated_tool_call_guidances: z.array(z.string()),
  designated_tool_call_validations: z.array(z.string()),
  designated_tool_call_params_generation_audio_fillers: z.array(z.string()).max(5),
  designated_tool_call_params_generation_audio_filler_triggered_after: z.number().min(0).max(10),
  tool_call_specs: z.array(toolCallSpecSchema),
});

const stateSchema = z.union([
  actionStateSchema,
  decisionStateSchema,
  recallStateSchema,
  annotationStateSchema,
  reflectionStateSchema,
  toolCallStateSchema,
]);

// ── Org ID (reused by every tool) ──

export const orgIdParam = z
  .string()
  .optional()
  .describe("Org ID (uses active org if omitted)");

// ── Agent ──

export const agentCreateParams = {
  agent_name: z.string().describe("Name for the agent"),
  org_id: orgIdParam,
};

export const agentUpdateParams = {
  agent_id: z.string().describe("The agent ID to update"),
  initials: z
    .string()
    .optional()
    .describe("Agent initials (e.g., 'MA'). Required for initial version."),
  identity: identitySchema
    .optional()
    .describe("Agent identity. Required for initial version."),
  background: z
    .string()
    .optional()
    .describe(
      "Agent background and experience. Required for initial version.",
    ),
  behaviors: z
    .array(z.string())
    .optional()
    .describe("Agent behaviors. Required for initial version."),
  communication_patterns: z
    .array(z.string())
    .optional()
    .describe("Communication style patterns. Required for initial version."),
  voice_config: voiceConfigSchema,
  org_id: orgIdParam,
};

// ── Context Graph ──

export const contextGraphCreateParams = {
  state_machine_name: z.string().describe("Name for the context graph"),
  org_id: orgIdParam,
};

export const contextGraphUpdateParams = {
  context_graph_id: z.string().describe("The context graph ID to update"),
  description: z.string().optional().describe("Description of the conversation flow"),
  new_user_initial_state: z
    .string()
    .optional()
    .describe("State name for new users"),
  returning_user_initial_state: z
    .string()
    .optional()
    .describe("State name for returning users"),
  terminal_state: z
    .string()
    .optional()
    .describe("Name of the terminal state (must have exactly one action)"),
  references: z
    .record(z.string(), z.unknown())
    .default({})
    .describe("Named references for reuse across states"),
  global_intra_state_navigation_guidelines: z
    .array(z.string())
    .optional()
    .describe("Navigation guidelines applied to all states"),
  global_action_guidelines: z
    .array(z.string())
    .optional()
    .describe("Action guidelines applied to all states"),
  global_boundary_constraints: z
    .array(z.string())
    .optional()
    .describe("Boundary constraints applied to all states"),
  states: z
    .array(stateSchema)
    .optional()
    .describe("Array of state definitions (action, decision, recall, annotation, reflection, or tool-call)"),
  org_id: orgIdParam,
};

// ── Service ──

export const serviceCreateParams = {
  agent_id: z.string().describe("ID of the agent to link"),
  service_hierarchical_state_machine_id: z
    .string()
    .describe("ID of the context graph to link"),
  name: z.string().describe("Service name"),
  description: z.string().describe("Brief description of what this service does"),
  is_active: z.boolean().describe("Whether the service is active"),
  keyterms: z.array(z.string()).describe("Keywords for discovery"),
  tags: z.record(z.string(), z.unknown()).describe("Metadata tags"),
  org_id: orgIdParam,
};

export const serviceUpdateParams = {
  service_id: z.string().describe("The service ID to update"),
  agent_id: z.string().optional().describe("ID of the agent to link"),
  service_hierarchical_state_machine_id: z
    .string()
    .optional()
    .describe("ID of the context graph to link"),
  name: z.string().optional().describe("Service name"),
  description: z.string().optional().describe("Brief description"),
  is_active: z.boolean().optional().describe("Whether the service is active"),
  keyterms: z.array(z.string()).optional().describe("Keywords for discovery"),
  tags: z.record(z.string(), z.unknown()).optional().describe("Metadata tags"),
  org_id: orgIdParam,
};

// ── Tool ──

export const toolCreateParams = {
  tool_name: z.string().describe("Name for the tool"),
  description: z.string().optional().describe("Tool description"),
  data: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Additional tool configuration fields"),
  org_id: orgIdParam,
};

export const toolUpdateParams = {
  tool_id: z.string().describe("The tool ID to update"),
  data: z
    .record(z.string(), z.unknown())
    .describe("Version data for the tool"),
  org_id: orgIdParam,
};

// ── Metric ──

export const metricCreateParams = {
  metric_name: z.string().describe("Name for the metric"),
  data: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Additional metric configuration fields"),
  org_id: orgIdParam,
};

export const metricUpdateParams = {
  metric_id: z.string().describe("The metric ID to update"),
  data: z
    .record(z.string(), z.unknown())
    .describe("Version data for the metric"),
  org_id: orgIdParam,
};

// ── Persona ──

export const personaCreateParams = {
  persona_name: z.string().describe("Name for the persona"),
  data: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Additional persona configuration fields"),
  org_id: orgIdParam,
};

export const personaUpdateParams = {
  persona_id: z.string().describe("The persona ID to update"),
  data: z
    .record(z.string(), z.unknown())
    .describe("Version data for the persona"),
  org_id: orgIdParam,
};

// ── Scenario ──

export const scenarioCreateParams = {
  scenario_name: z.string().describe("Name for the scenario"),
  data: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Additional scenario configuration fields"),
  org_id: orgIdParam,
};

export const scenarioUpdateParams = {
  scenario_id: z.string().describe("The scenario ID to update"),
  data: z
    .record(z.string(), z.unknown())
    .describe("Version data for the scenario"),
  org_id: orgIdParam,
};

// ── Dynamic Behavior Set ──

export const dynamicBehaviorSetCreateParams = {
  data: z
    .record(z.string(), z.unknown())
    .describe("Dynamic behavior set data"),
  org_id: orgIdParam,
};

export const dynamicBehaviorSetUpdateParams = {
  dynamic_behavior_set_id: z
    .string()
    .describe("The dynamic behavior set ID to update"),
  data: z
    .record(z.string(), z.unknown())
    .describe("Version data for the dynamic behavior set"),
  org_id: orgIdParam,
};

// ── Unit Test ──

export const unitTestCreateParams = {
  data: z
    .record(z.string(), z.unknown())
    .describe("Unit test data"),
  org_id: orgIdParam,
};

export const unitTestUpdateParams = {
  unit_test_id: z.string().describe("The unit test ID to update"),
  data: z
    .record(z.string(), z.unknown())
    .describe("Version data for the unit test"),
  org_id: orgIdParam,
};

// ── Unit Test Set ──

export const unitTestSetCreateParams = {
  data: z
    .record(z.string(), z.unknown())
    .describe("Unit test set data"),
  org_id: orgIdParam,
};

export const unitTestSetUpdateParams = {
  unit_test_set_id: z.string().describe("The unit test set ID to update"),
  data: z
    .record(z.string(), z.unknown())
    .describe("Version data for the unit test set"),
  org_id: orgIdParam,
};

// ── User Dimension ──

export const userDimensionCreateParams = {
  data: z
    .record(z.string(), z.unknown())
    .describe("User dimension data"),
  org_id: orgIdParam,
};

export const userDimensionUpdateParams = {
  user_dimension_id: z
    .string()
    .describe("The user dimension ID to update"),
  data: z
    .record(z.string(), z.unknown())
    .describe("Version data for the user dimension"),
  org_id: orgIdParam,
};
