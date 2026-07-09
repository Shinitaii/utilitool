export const llmConfigPaths = {
  "/llm-config": {
    get: {
      tags: ["LLM Config"],
      summary: "Get the current user's LLM provider config",
      description: "Returns provider + model + whether a key is set. Never returns the API key itself.",
      security: [{BearerAuth: []}],
      responses: {
        "200": {
          description: "LLM config (or nulls if never configured)",
          content: {
            "application/json": {
              schema: {$ref: "#/components/schemas/LlmConfigResponse"},
            },
          },
        },
        "401": {
          description: "Unauthorized",
          content: {"application/json": {schema: {$ref: "#/components/schemas/ErrorResponse"}}},
        },
      },
    },
    patch: {
      tags: ["LLM Config"],
      summary: "Set or update the current user's LLM provider config",
      description: "The API key is encrypted (AES-256-GCM) server-side before storage and is never echoed back.",
      security: [{BearerAuth: []}],
      requestBody: {
        content: {
          "application/json": {
            schema: {$ref: "#/components/schemas/UpsertLlmConfigRequest"},
          },
        },
      },
      responses: {
        "200": {
          description: "Updated LLM config",
          content: {
            "application/json": {
              schema: {$ref: "#/components/schemas/LlmConfigResponse"},
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
      },
    },
  },
};
