import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ClientPool } from "../api/client-pool.js";
import { getClientForOrg, textResult, jsonResult } from "./shared.js";

export function registerConversationTools(
  server: McpServer,
  pool: ClientPool,
): void {
  server.tool(
    "forge_smoke_test",
    "Run a quick smoke test against a service. Creates a conversation, sends a message, and returns the agent's response.",
    {
      service_name: z.string().describe("The service name to test"),
      message: z
        .string()
        .optional()
        .describe("The user message to send (omit for agent greeting only)"),
      version_set: z
        .string()
        .optional()
        .describe("Version set to use (default: release)"),
      org_id: z.string().optional().describe("Org ID (uses active org if omitted)"),
    },
    async ({ service_name, message, version_set, org_id }) => {
      const { orgId, client } = getClientForOrg(pool, org_id);

      // Find service by name
      const services = await client.paginate<Record<string, unknown>>(
        "service/",
        "services",
      );
      const service = services.find(
        (s) =>
          String(s["name"] ?? s["service_name"]).toLowerCase() ===
          service_name.toLowerCase(),
      );

      if (!service) {
        return textResult(
          `Service "${service_name}" not found in org "${orgId}".`,
        );
      }

      const serviceId = String(service["id"]);

      // Create conversation
      const createBody: Record<string, unknown> = {
        service_id: serviceId,
        service_version_set_name: version_set ?? "release",
      };

      if (message) {
        createBody["initial_message"] = message;
        createBody["initial_message_type"] = "user-message";
      }

      const stream = await client.requestStream("conversation/", {
        method: "POST",
        body: createBody,
        queryParams: { response_format: "text" },
      });

      let conversationId = "";
      const agentMessages: string[] = [];
      let interactionId = "";

      for await (const line of stream) {
        try {
          const event = JSON.parse(line) as Record<string, unknown>;
          if (event["type"] === "conversation-created") {
            conversationId = String(event["conversation_id"]);
          } else if (event["type"] === "new-message") {
            agentMessages.push(String(event["message"]));
          } else if (event["type"] === "interaction-complete") {
            interactionId = String(event["interaction_id"]);
          }
        } catch {
          // Skip malformed lines
        }
      }

      // Finish the conversation
      if (conversationId) {
        try {
          await client.request(`conversation/${conversationId}/finish/`, {
            method: "POST",
            body: {},
          });
        } catch {
          // Best effort cleanup
        }
      }

      const agentResponse = agentMessages.join("");

      return textResult(
        [
          `Smoke test: ${service_name} (${orgId})`,
          `Conversation: ${conversationId}`,
          `Interaction: ${interactionId}`,
          message ? `User: ${message}` : "(no user message -- greeting only)",
          `Agent: ${agentResponse || "(no response)"}`,
        ].join("\n"),
      );
    },
  );

  server.tool(
    "forge_simulate",
    "Run an automated multi-turn conversation simulation against a service.",
    {
      service_name: z.string().describe("The service name"),
      max_turns: z
        .number()
        .optional()
        .describe("Maximum number of turns (default: 10)"),
      initial_message: z
        .string()
        .optional()
        .describe("Initial user message"),
      version_set: z
        .string()
        .optional()
        .describe("Version set to use (default: release)"),
      org_id: z.string().optional().describe("Org ID (uses active org if omitted)"),
    },
    async ({ service_name, max_turns, initial_message, version_set, org_id }) => {
      const { orgId, client } = getClientForOrg(pool, org_id);
      const maxTurns = max_turns ?? 10;

      // Find service
      const services = await client.paginate<Record<string, unknown>>(
        "service/",
        "services",
      );
      const service = services.find(
        (s) =>
          String(s["name"] ?? s["service_name"]).toLowerCase() ===
          service_name.toLowerCase(),
      );

      if (!service) {
        return textResult(`Service "${service_name}" not found in org "${orgId}".`);
      }

      const serviceId = String(service["id"]);
      const transcript: string[] = [];

      // Create conversation
      const createBody: Record<string, unknown> = {
        service_id: serviceId,
        service_version_set_name: version_set ?? "release",
      };
      if (initial_message) {
        createBody["initial_message"] = initial_message;
        createBody["initial_message_type"] = "user-message";
        transcript.push(`User: ${initial_message}`);
      }

      const stream = await client.requestStream("conversation/", {
        method: "POST",
        body: createBody,
        queryParams: { response_format: "text" },
      });

      let conversationId = "";
      let agentMsg: string[] = [];
      let lastInteractionId = "";
      let conversationCompleted = false;

      for await (const line of stream) {
        try {
          const event = JSON.parse(line) as Record<string, unknown>;
          if (event["type"] === "conversation-created") {
            conversationId = String(event["conversation_id"]);
          } else if (event["type"] === "new-message") {
            agentMsg.push(String(event["message"]));
          } else if (event["type"] === "interaction-complete") {
            lastInteractionId = String(event["interaction_id"]);
            conversationCompleted = Boolean(event["conversation_completed"]);
          }
        } catch {
          // skip
        }
      }

      if (agentMsg.length > 0) {
        transcript.push(`Agent: ${agentMsg.join("")}`);
      }

      // Simulate turns using recommended responses
      for (let turn = 1; turn < maxTurns && !conversationCompleted; turn++) {
        // Get recommended responses
        let userMessage: string;
        try {
          const recResp = await client.request<Record<string, unknown>>(
            `conversation/${conversationId}/interaction/${lastInteractionId}/recommend_responses`,
            {
              method: "POST",
              body: { context: "Continue the conversation naturally." },
            },
          );
          const recs = recResp["recommended_responses"] as string[] | undefined;
          if (!recs || recs.length === 0) break;
          userMessage = recs[0];
        } catch {
          break;
        }

        transcript.push(`User: ${userMessage}`);

        // Send the message
        agentMsg = [];
        try {
          const interactStream = await client.requestStream(
            `conversation/${conversationId}/interact`,
            {
              method: "POST",
              body: {
                initial_message_type: "user-message",
                recorded_message: userMessage,
              },
              queryParams: {
                request_format: "text",
                response_format: "text",
              },
              multipart: true,
            },
          );

          for await (const line of interactStream) {
            try {
              const event = JSON.parse(line) as Record<string, unknown>;
              if (event["type"] === "new-message") {
                agentMsg.push(String(event["message"]));
              } else if (event["type"] === "interaction-complete") {
                lastInteractionId = String(event["interaction_id"]);
                conversationCompleted = Boolean(
                  event["conversation_completed"],
                );
              }
            } catch {
              // skip
            }
          }

          if (agentMsg.length > 0) {
            transcript.push(`Agent: ${agentMsg.join("")}`);
          }
        } catch (err) {
          transcript.push(
            `[Error on turn ${turn}: ${err instanceof Error ? err.message : String(err)}]`,
          );
          break;
        }
      }

      // Finish conversation
      if (conversationId) {
        try {
          await client.request(`conversation/${conversationId}/finish/`, {
            method: "POST",
            body: {},
          });
        } catch {
          // best effort
        }
      }

      return textResult(
        [
          `Simulation: ${service_name} (${orgId})`,
          `Conversation: ${conversationId}`,
          `Turns: ${Math.ceil(transcript.length / 2)}/${maxTurns}`,
          `Completed: ${conversationCompleted}`,
          "",
          "--- Transcript ---",
          ...transcript,
        ].join("\n"),
      );
    },
  );

  server.tool(
    "forge_conversation_insights",
    "Get debugging insights for a conversation, including state transitions and triggered behaviors.",
    {
      conversation_id: z.string().describe("The conversation ID"),
      interaction_id: z
        .string()
        .optional()
        .describe("Specific interaction ID (omit for all)"),
      org_id: z.string().optional().describe("Org ID (uses active org if omitted)"),
    },
    async ({ conversation_id, interaction_id, org_id }) => {
      const { client } = getClientForOrg(pool, org_id);

      if (interaction_id) {
        const insights = await client.request(
          `conversation/${conversation_id}/interaction/${interaction_id}/insights`,
        );
        return jsonResult(insights);
      }

      // Get all messages to find interaction IDs, then fetch insights for each
      const messages = await client.request<Record<string, unknown>>(
        `conversation/${conversation_id}/messages/`,
        {
          queryParams: {
            message_type: ["agent-message", "user-message"],
            limit: "500",
          },
        },
      );

      const msgList = (messages["messages"] as Record<string, unknown>[]) ?? [];
      const interactionIds = [
        ...new Set(
          msgList
            .map((m) => m["interaction_id"] as string | undefined)
            .filter(Boolean),
        ),
      ];

      const allInsights: Record<string, unknown>[] = [];
      for (const intId of interactionIds) {
        try {
          const insight = await client.request(
            `conversation/${conversation_id}/interaction/${intId}/insights`,
          );
          allInsights.push({
            interaction_id: intId,
            ...(insight as Record<string, unknown>),
          });
        } catch {
          // Skip failed insight fetches
        }
      }

      return jsonResult(allInsights);
    },
  );

  server.tool(
    "forge_conversation_evaluate",
    "Run on-demand metric evaluation against a conversation.",
    {
      conversation_id: z.string().describe("The conversation ID"),
      metric_name: z.string().describe("The metric name to evaluate"),
      interaction_id: z
        .string()
        .optional()
        .describe("Specific interaction ID (omit for full conversation)"),
      org_id: z.string().optional().describe("Org ID (uses active org if omitted)"),
    },
    async ({ conversation_id, metric_name, interaction_id, org_id }) => {
      const { client } = getClientForOrg(pool, org_id);

      // Find metric by name
      const metrics = await client.paginate<Record<string, unknown>>(
        "metric/",
        "metrics",
      );
      const metric = metrics.find(
        (m) =>
          String(m["name"] ?? m["metric_name"]).toLowerCase() ===
          metric_name.toLowerCase(),
      );

      if (!metric) {
        return textResult(`Metric "${metric_name}" not found.`);
      }

      const metricId = String(metric["id"]);

      const body: Record<string, unknown> = {
        metric_ids: [metricId],
        conversation_id: conversation_id,
      };
      if (interaction_id) {
        body["interaction_id"] = interaction_id;
      }

      const result = await client.request("metric/evaluate", {
        method: "POST",
        body,
      });

      return jsonResult(result);
    },
  );
}
