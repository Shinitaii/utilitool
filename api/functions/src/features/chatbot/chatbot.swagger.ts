export const chatbotPaths = {
  "/chatbot": {
    post: {
      tags: ["Chatbot"],
      summary: "Send a message to the billing insight chatbot",
      description:
        "Grounded in real billing/reading data via function-calling (get_usage_history, " +
        "get_accumulated_totals, detect_spikes). Requires an LLM provider configured via /llm-config.",
      security: [{BearerAuth: []}],
      requestBody: {
        content: {
          "application/json": {
            schema: {$ref: "#/components/schemas/ChatRequest"},
          },
        },
      },
      responses: {
        "200": {
          description: "Assistant reply",
          content: {
            "application/json": {
              schema: {$ref: "#/components/schemas/ChatResponse"},
            },
          },
        },
        "400": {
          description: "Validation error",
          content: {"application/json": {schema: {$ref: "#/components/schemas/ValidationErrorResponse"}}},
        },
        "401": {
          description: "Unauthorized",
          content: {"application/json": {schema: {$ref: "#/components/schemas/ErrorResponse"}}},
        },
        "404": {
          description: "LLM provider not configured",
          content: {"application/json": {schema: {$ref: "#/components/schemas/ErrorResponse"}}},
        },
        "429": {
          description: "LLM provider rate limit reached",
          content: {"application/json": {schema: {$ref: "#/components/schemas/ErrorResponse"}}},
        },
      },
    },
  },
};
