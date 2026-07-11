export const llmConfigPaths = {
  "/llm-config": {
    get: {
      tags: ["LLM Config"],
      summary: "Get the current user's LLM provider config",
      description: "Returns the chat provider/model plus the independent vision (OCR) provider/model, and whether keys are set for each. Never returns API keys themselves.",
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
      summary: "Set or update the current user's chat LLM provider config",
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
  "/llm-config/vision": {
    patch: {
      tags: ["LLM Config"],
      summary: "Set or update the current user's vision (OCR) LLM provider config",
      description: "Independent from the chat provider — some providers have no usable free vision model. When the vision provider matches the chat provider, apiKey is optional and the chat key is reused; when it differs, apiKey is required (unless a key was already stored for that exact provider).",
      security: [{BearerAuth: []}],
      requestBody: {
        content: {
          "application/json": {
            schema: {$ref: "#/components/schemas/UpsertVisionLlmConfigRequest"},
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
          description: "Validation error, or apiKey required (no chat config yet, or vision provider differs from chat provider with no key)",
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
