export const readingPaths = {
  "/readings": {
    post: {
      tags: ["Readings"],
      summary: "Create a new meter reading",
      description:
        "Create a single meter reading. If a reading exists for the same meter_group in the previous calendar month, billings are automatically created (atomically, one per property on that meter group). Batch create (/readings/batch) does NOT trigger auto-billing. The meter_version field is automatically set from the meter group's current_version. To handle a physical meter reset, call POST /meter-groups/:id/reset first.",
      security: [{BearerAuth: []}],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/CreateReadingRequest",
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Reading created",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/Reading",
              },
            },
          },
        },
        "400": {
          description:
            "Validation error (negative amount, future date, reading limit exceeded)",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ValidationErrorResponse",
              },
            },
          },
        },
        "401": {
          description: "Unauthorized",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ErrorResponse",
              },
            },
          },
        },
        "404": {
          description: "Meter group not found",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ErrorResponse",
              },
            },
          },
        },
        "500": {
          description: "Internal server error",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ErrorResponse",
              },
            },
          },
        },
      },
    },
    get: {
      tags: ["Readings"],
      summary: "List meter readings",
      description:
        "Retrieve paginated list of readings. Can filter by meter group ID, property, and date range. Note: cursor and date filters are mutually exclusive with cursor pagination.",
      security: [{BearerAuth: []}],
      parameters: [
        {
          name: "meterGroupId",
          in: "query",
          description: "Filter by meter group ID",
          schema: {
            type: "string",
            minLength: 1,
          },
        },
        {
          name: "propertyId",
          in: "query",
          description: "Filter by property ID",
          schema: {
            type: "string",
            minLength: 1,
          },
        },
        {
          name: "startDate",
          in: "query",
          description: "Filter readings from this date onwards (ISO 8601 date or datetime format)",
          schema: {
            type: "string",
            format: "date-time",
          },
        },
        {
          name: "endDate",
          in: "query",
          description: "Filter readings up to this date (ISO 8601 date or datetime format)",
          schema: {
            type: "string",
            format: "date-time",
          },
        },
        {
          name: "limit",
          in: "query",
          description: "Number of results per page (1-100, default 20)",
          schema: {
            type: "integer",
            minimum: 1,
            maximum: 100,
            default: 20,
          },
        },
        {
          name: "cursor",
          in: "query",
          description:
            "Pagination cursor from previous response. Cannot be combined with date filters.",
          schema: {
            type: "string",
          },
        },
        {
          name: "sortBy",
          in: "query",
          description: "Field to sort by",
          schema: {
            type: "string",
            enum: ["created_at", "reading_date"],
          },
        },
        {
          name: "sortOrder",
          in: "query",
          description: "Sort direction",
          schema: {
            type: "string",
            enum: ["asc", "desc"],
          },
        },
        {
          name: "archived",
          in: "query",
          description: "List soft-deleted (archived) readings instead of active ones",
          schema: {
            type: "string",
            enum: ["true", "false"],
          },
        },
      ],
      responses: {
        "200": {
          description: "List of readings",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/PaginatedReadings",
              },
            },
          },
        },
        "400": {
          description: "Validation error",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ValidationErrorResponse",
              },
            },
          },
        },
        "401": {
          description: "Unauthorized",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ErrorResponse",
              },
            },
          },
        },
        "500": {
          description: "Internal server error",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ErrorResponse",
              },
            },
          },
        },
      },
    },
  },
  "/readings/batch": {
    post: {
      tags: ["Readings"],
      summary: "Create multiple meter readings",
      description: "Batch create 1-10 meter readings. Does NOT trigger auto-billing — use single POST /readings for that. " +
        "Each reading is validated and created independently: an invalid or duplicate item (e.g. meter group not " +
        "found, or a reading already exists for that property+month) is reported per-index in `failed` rather " +
        "than aborting the whole batch, so other valid readings are still created.",
      security: [{BearerAuth: []}],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "array",
              items: {
                $ref: "#/components/schemas/CreateReadingRequest",
              },
              minItems: 1,
              maxItems: 10,
            },
          },
        },
      },
      responses: {
        "201": {
          description: "Batch processed (may include partial failures — see `failed`)",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  created: {
                    type: "array",
                    items: {$ref: "#/components/schemas/Reading"},
                  },
                  failed: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        index: {type: "integer", description: "Index into the request array"},
                        error: {type: "string"},
                      },
                    },
                  },
                },
              },
            },
          },
        },
        "400": {
          description: "Validation error",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ValidationErrorResponse",
              },
            },
          },
        },
        "401": {
          description: "Unauthorized",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ErrorResponse",
              },
            },
          },
        },
        "500": {
          description: "Internal server error",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ErrorResponse",
              },
            },
          },
        },
      },
    },
    put: {
      tags: ["Readings"],
      summary: "Update multiple meter readings",
      description: "Batch update 1-10 meter readings.",
      security: [{BearerAuth: []}],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: {
                    type: "string",
                  },
                  data: {
                    $ref: "#/components/schemas/UpdateReadingRequest",
                  },
                },
                required: ["id", "data"],
              },
              minItems: 1,
              maxItems: 10,
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Readings updated",
          content: {
            "application/json": {
              schema: {
                type: "array",
                items: {
                  $ref: "#/components/schemas/Reading",
                },
              },
            },
          },
        },
        "400": {
          description: "Validation error",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ValidationErrorResponse",
              },
            },
          },
        },
        "401": {
          description: "Unauthorized",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ErrorResponse",
              },
            },
          },
        },
        "404": {
          description: "Reading or meter group not found",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ErrorResponse",
              },
            },
          },
        },
        "500": {
          description: "Internal server error",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ErrorResponse",
              },
            },
          },
        },
      },
    },
  },
  "/readings/{id}": {
    get: {
      tags: ["Readings"],
      summary: "Get reading by ID",
      description: "Retrieve a single meter reading by ID.",
      security: [{BearerAuth: []}],
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          schema: {
            type: "string",
            minLength: 1,
          },
        },
      ],
      responses: {
        "200": {
          description: "Reading retrieved",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/Reading",
              },
            },
          },
        },
        "401": {
          description: "Unauthorized",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ErrorResponse",
              },
            },
          },
        },
        "404": {
          description: "Reading not found",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ErrorResponse",
              },
            },
          },
        },
        "500": {
          description: "Internal server error",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ErrorResponse",
              },
            },
          },
        },
      },
    },
    put: {
      tags: ["Readings"],
      summary: "Update a meter reading",
      description: "Update a single meter reading.",
      security: [{BearerAuth: []}],
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          schema: {
            type: "string",
            minLength: 1,
          },
        },
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/UpdateReadingRequest",
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Reading updated",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/Reading",
              },
            },
          },
        },
        "400": {
          description: "Validation error",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ValidationErrorResponse",
              },
            },
          },
        },
        "401": {
          description: "Unauthorized",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ErrorResponse",
              },
            },
          },
        },
        "404": {
          description: "Reading or meter group not found",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ErrorResponse",
              },
            },
          },
        },
        "500": {
          description: "Internal server error",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ErrorResponse",
              },
            },
          },
        },
      },
    },
    delete: {
      tags: ["Readings"],
      summary: "Delete a reading (hard delete)",
      description: "Permanently delete a meter reading.",
      security: [{BearerAuth: []}],
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          schema: {
            type: "string",
            minLength: 1,
          },
        },
      ],
      responses: {
        "200": {
          description: "Reading deleted",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: {
                    type: "string",
                  },
                },
              },
            },
          },
        },
        "401": {
          description: "Unauthorized",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ErrorResponse",
              },
            },
          },
        },
        "404": {
          description: "Reading not found",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ErrorResponse",
              },
            },
          },
        },
        "500": {
          description: "Internal server error",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ErrorResponse",
              },
            },
          },
        },
      },
    },
  },
  "/readings/soft/{id}": {
    delete: {
      tags: ["Readings"],
      summary: "Soft delete a reading",
      description: "Soft delete (mark as deleted) a meter reading.",
      security: [{BearerAuth: []}],
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          schema: {
            type: "string",
            minLength: 1,
          },
        },
      ],
      responses: {
        "200": {
          description: "Reading soft deleted",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/Reading",
              },
            },
          },
        },
        "401": {
          description: "Unauthorized",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ErrorResponse",
              },
            },
          },
        },
        "404": {
          description: "Reading not found",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ErrorResponse",
              },
            },
          },
        },
        "500": {
          description: "Internal server error",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ErrorResponse",
              },
            },
          },
        },
      },
    },
  },
};
