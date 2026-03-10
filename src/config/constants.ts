export const AMIGO_APP_HEADER_NAME = "X-Amigo-Application";
export const AMIGO_APP_HEADER_VALUE = "forge";

export const DEFAULT_API_BASE_URL = "https://api.amigo.ai";

export const ENTITY_TYPES = [
  "agent",
  "context_graph",
  "dynamic_behavior_set",
  "metric",
  "persona",
  "scenario",
  "service",
  "tool",
  "unit_test",
  "unit_test_set",
  "user_dimension",
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];

/** API path segments for each entity type. */
export const ENTITY_API_PATHS: Record<EntityType, string> = {
  agent: "organization/agent",
  context_graph: "organization/service_hierarchical_state_machine",
  dynamic_behavior_set: "dynamic_behavior_set",
  metric: "metric",
  persona: "persona",
  scenario: "scenario",
  service: "service",
  tool: "tool",
  unit_test: "unit_test",
  unit_test_set: "unit_test_set",
  user_dimension: "user_dimension",
};

/** Response list keys returned by each entity list endpoint. */
export const ENTITY_LIST_KEYS: Record<EntityType, string> = {
  agent: "agents",
  context_graph: "service_hierarchical_state_machines",
  dynamic_behavior_set: "dynamic_behavior_sets",
  metric: "metrics",
  persona: "personas",
  scenario: "scenarios",
  service: "services",
  tool: "tools",
  unit_test: "unit_tests",
  unit_test_set: "unit_test_sets",
  user_dimension: "user_dimensions",
};

/** Entity dependency order for sync operations. */
export const ENTITY_SYNC_ORDER: EntityType[] = [
  "agent",
  "context_graph",
  "service",
  "tool",
  "dynamic_behavior_set",
  "user_dimension",
  "persona",
  "scenario",
  "metric",
  "unit_test",
  "unit_test_set",
];
