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

const tagsSchema = z
  .record(z.string(), z.unknown())
  .describe("Tags (alphanumeric keys and values)");

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

// ── Success criterion (unit tests) ──

const successCriterionSchema = z.object({
  name: z.string().describe("Name of the success criterion"),
  metric_id: z.string().describe("24-char hex ID of the metric"),
  criterion: z
    .record(z.string(), z.unknown())
    .describe("Criterion description (boolean, numerical, or categorical)"),
});

// ── Unit test run descriptor ──

const unitTestRunDescriptorSchema = z.object({
  unit_test_id: z.string().describe("24-char hex ID of the unit test"),
  run_count: z.number().int().positive().describe("Number of times to run the unit test"),
});

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
  description: z.string().describe("Description of the conversation flow"),
  new_user_initial_state: z
    .string()
    .describe("State name for new users (must be an action state)"),
  returning_user_initial_state: z
    .string()
    .describe("State name for returning users (must be an action state)"),
  terminal_state: z
    .string()
    .describe("Name of the terminal state (must have exactly one action)"),
  references: z
    .record(z.string(), z.unknown())
    .default({})
    .describe("References to other state machines: { ref_name: [machine_id, version] }"),
  global_intra_state_navigation_guidelines: z
    .array(z.string())
    .describe("Navigation guidelines applied to all states"),
  global_action_guidelines: z
    .array(z.string())
    .describe("Action guidelines applied to all states"),
  global_boundary_constraints: z
    .array(z.string())
    .describe("Boundary constraints applied to all states"),
  states: z
    .array(stateSchema)
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
  keyterms: z.array(z.string()).describe("Keywords for audio transcription correction"),
  tags: tagsSchema,
  org_id: orgIdParam,
};

export const serviceUpdateParams = {
  service_id: z.string().describe("The service ID to update"),
  name: z.string().optional().describe("Service name"),
  description: z.string().optional().describe("Brief description"),
  is_active: z.boolean().optional().describe("Whether the service is active"),
  agent_id: z.string().optional().describe("ID of the agent to link"),
  service_hierarchical_state_machine_id: z
    .string()
    .optional()
    .describe("ID of the context graph to link"),
  tags: tagsSchema.optional(),
  keyterms: z.array(z.string()).optional().describe("Keywords for audio transcription correction"),
  org_id: orgIdParam,
};

// ── Tool ──

export const toolCreateParams = {
  name: z.string().describe("Unique tool name (lowercase, alphanumeric, underscores)"),
  description: z.string().describe("Description of the tool"),
  tags: tagsSchema,
  org_id: orgIdParam,
};

export const toolUpdateParams = {
  tool_id: z.string().describe("The tool ID to update"),
  description: z.string().optional().describe("Updated description"),
  tags: tagsSchema.optional(),
  org_id: orgIdParam,
};

// ── Metric ──

export const metricCreateParams = {
  name: z.string().describe("Unique metric name within the organization"),
  description: z.string().describe("Description of the metric"),
  applied_to_services: z
    .array(z.string())
    .describe("Service IDs this metric applies to"),
  additional_notes: z
    .string()
    .nullable()
    .describe("Additional notes about the metric (null if none)"),
  tags: tagsSchema,
  metric_value: z
    .record(z.string(), z.unknown())
    .describe(
      'Metric value definition. Must include "type" discriminator: "boolean", "numerical", or "categorical"',
    ),
  org_id: orgIdParam,
};

export const metricUpdateParams = {
  metric_id: z.string().describe("The metric ID to update"),
  description: z.string().optional().describe("Updated description"),
  applied_to_services: z
    .array(z.string())
    .optional()
    .describe("Service IDs this metric applies to"),
  additional_notes: z
    .string()
    .nullable()
    .optional()
    .describe("Additional notes about the metric"),
  tags: tagsSchema.optional(),
  org_id: orgIdParam,
};

// ── Persona ──

const personaInitialVersionSchema = z.object({
  background: z.string().describe("Background of the simulation persona"),
  user_models: z
    .array(z.string())
    .describe("User models associated with the persona"),
  nonsensitive_user_variables: z
    .record(z.string(), z.unknown())
    .describe("Non-sensitive user variables provided before the conversation"),
  sensitive_user_variables: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Sensitive user variables provided before the conversation"),
  preferred_language: z
    .string()
    .optional()
    .describe("Preferred language in ISO 639-3 format"),
  timezone: z
    .string()
    .optional()
    .describe("Timezone in IANA tz database format"),
});

export const personaCreateParams = {
  name: z.string().describe("Name for the simulation persona"),
  role: z.string().describe("Role of the simulation persona"),
  tags: tagsSchema,
  initial_version: personaInitialVersionSchema.describe(
    "Initial version of the persona",
  ),
  org_id: orgIdParam,
};

export const personaUpdateParams = {
  persona_id: z.string().describe("The persona ID to update"),
  tags: tagsSchema.optional(),
  org_id: orgIdParam,
};

// ── Scenario ──

const scenarioInitialVersionSchema = z.object({
  objective: z.string().describe("Objective of the simulation scenario"),
  instructions: z.string().describe("Instructions for the simulation"),
  initial_message_type: z
    .enum(["user-message", "external-event", "skip"])
    .describe("How the conversation starts"),
  conversation_starts_at: z
    .string()
    .nullable()
    .describe("UTC timestamp for when the conversation starts, or null"),
});

export const scenarioCreateParams = {
  name: z.string().describe("Name for the simulation scenario"),
  tags: tagsSchema,
  initial_version: scenarioInitialVersionSchema.describe(
    "Initial version of the scenario",
  ),
  org_id: orgIdParam,
};

export const scenarioUpdateParams = {
  scenario_id: z.string().describe("The scenario ID to update"),
  tags: tagsSchema.optional(),
  org_id: orgIdParam,
};

// ── Dynamic Behavior Set ──

const dbsInitialVersionSchema = z.object({
  is_active: z
    .boolean()
    .describe("Whether the dynamic behavior set should be active after creation"),
  conversation_triggers: z
    .array(z.string())
    .describe("Conversation triggers that activate this behavior set"),
  actions: z
    .array(z.record(z.string(), z.unknown()))
    .describe(
      'Actions to perform when activated. Each must include "type": "inject-instruction" or "change-tool-candidates"',
    ),
});

export const dynamicBehaviorSetCreateParams = {
  name: z.string().describe("Name for the dynamic behavior set"),
  tags: tagsSchema,
  applied_to_services: z
    .array(z.string())
    .describe("Service IDs to apply this behavior set to"),
  initial_version: dbsInitialVersionSchema.describe(
    "Initial version configuration",
  ),
  org_id: orgIdParam,
};

export const dynamicBehaviorSetUpdateParams = {
  dynamic_behavior_set_id: z
    .string()
    .describe("The dynamic behavior set ID to update"),
  name: z.string().optional().describe("Updated name"),
  tags: tagsSchema.optional(),
  applied_to_services: z
    .array(z.string())
    .optional()
    .describe("Service IDs to apply this behavior set to"),
  is_active: z.boolean().optional().describe("Whether the behavior set is active"),
  org_id: orgIdParam,
};

// ── Unit Test ──

export const unitTestCreateParams = {
  name: z.string().describe("Name for the unit test"),
  description: z.string().describe("Description of the unit test"),
  service_id: z.string().describe("Service ID to run the test on"),
  service_version_set_name: z
    .string()
    .describe("Version set name to use (e.g., 'edge', 'release')"),
  persona_id: z.string().describe("Persona ID for the test"),
  scenario_id: z.string().describe("Scenario ID for the test"),
  max_interactions: z
    .number()
    .int()
    .positive()
    .describe("Max interactions before the test fails"),
  success_criterions: z
    .array(successCriterionSchema)
    .describe("Success criteria for the test"),
  tags: tagsSchema,
  org_id: orgIdParam,
};

export const unitTestUpdateParams = {
  unit_test_id: z.string().describe("The unit test ID to update"),
  description: z.string().optional().describe("Updated description"),
  service_id: z.string().optional().describe("Service ID to run the test on"),
  service_version_set_name: z
    .string()
    .optional()
    .describe("Version set name to use"),
  persona_id: z.string().optional().describe("Persona ID for the test"),
  scenario_id: z.string().optional().describe("Scenario ID for the test"),
  max_interactions: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Max interactions before the test fails"),
  success_criterions: z
    .array(successCriterionSchema)
    .optional()
    .describe("Success criteria for the test"),
  run_count: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Number of sessions to simulate per run"),
  tags: tagsSchema.optional(),
  org_id: orgIdParam,
};

// ── Unit Test Set ──

export const unitTestSetCreateParams = {
  name: z.string().describe("Name for the unit test set"),
  description: z
    .string()
    .nullable()
    .describe("Description of the unit test set (null if none)"),
  unit_test_runs: z
    .array(unitTestRunDescriptorSchema)
    .describe("Unit test runs included in this set"),
  tags: tagsSchema,
  org_id: orgIdParam,
};

export const unitTestSetUpdateParams = {
  unit_test_set_id: z.string().describe("The unit test set ID to update"),
  name: z.string().optional().describe("Updated name"),
  description: z
    .string()
    .nullable()
    .optional()
    .describe("Updated description"),
  unit_test_runs: z
    .array(unitTestRunDescriptorSchema)
    .optional()
    .describe("Unit test runs included in this set"),
  tags: tagsSchema.optional(),
  org_id: orgIdParam,
};
