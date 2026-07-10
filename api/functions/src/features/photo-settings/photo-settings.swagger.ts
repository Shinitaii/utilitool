export const photoSettingsPaths = {
  "/photo-settings": {
    get: {
      tags: ["Photo Settings"],
      summary: "Get the current user's photo-saving preference",
      description: "Whether meter-reading photos should be persisted (image_url) when creating readings. Defaults to false (disabled) if never configured — OCR suggest still works, the photo is just discarded before submission. Bill / billing-cycle photos are never persisted regardless of this setting.",
      security: [{BearerAuth: []}],
      responses: {
        "200": {
          description: "Photo-saving preference",
          content: {
            "application/json": {
              schema: {$ref: "#/components/schemas/PhotoSettingsResponse"},
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
      tags: ["Photo Settings"],
      summary: "Set the current user's photo-saving preference",
      security: [{BearerAuth: []}],
      requestBody: {
        content: {
          "application/json": {
            schema: {$ref: "#/components/schemas/UpsertPhotoSettingsRequest"},
          },
        },
      },
      responses: {
        "200": {
          description: "Updated photo-saving preference",
          content: {
            "application/json": {
              schema: {$ref: "#/components/schemas/PhotoSettingsResponse"},
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
