export const billingCyclePaths = {
  "/billing-cycles": {
    post: {
      tags: ["Billing Cycles"],
      summary: "Create a new billing cycle",
      description:
        "Create a single billing cycle. Validates that all billing IDs exist, start date < end date, and billing consumption is within 3% tolerance of the sum of individual billing amounts.",
      security: [{BearerAuth: []}],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/CreateBillingCycleRequest",
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Billing cycle created",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/BillingCycle",
              },
            },
          },
        },
        "400": {
          description:
            "Validation error (invalid date range, consumption mismatch >3%, empty billing_ids, negative values)",
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
          description: "Billing not found",
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
      tags: ["Billing Cycles"],
      summary: "List billing cycles",
      description:
        "Retrieve paginated list of billing cycles. Can filter by start and end dates. Note: cursor and date filters are mutually exclusive.",
      security: [{BearerAuth: []}],
      parameters: [
        {
          name: "billingStartDate",
          in: "query",
          description: "Filter by billing start date (ISO 8601 datetime string)",
          schema: {
            type: "string",
            format: "date-time",
          },
        },
        {
          name: "billingEndDate",
          in: "query",
          description: "Filter by billing end date (ISO 8601 datetime string)",
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
            enum: ["created_at", "billing_start_date"],
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
          description: "List soft-deleted (archived) billing cycles instead of active ones",
          schema: {
            type: "string",
            enum: ["true", "false"],
          },
        },
      ],
      responses: {
        "200": {
          description: "List of billing cycles",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/PaginatedBillingCycles",
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
  "/billing-cycles/ocr": {
    post: {
      tags: ["Billing Cycles"],
      summary: "Extract billing data from utility bill photo",
      description: "Uses Gemini vision to extract billing_start_date, billing_end_date, billing_consumption, billing_rate, and raw_amount from a Philippine utility bill (Meralco/Manila Water).",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["image_url"],
              properties: {
                image_url: {
                  type: "string",
                  description: "Data URL (data:image/...) or public HTTPS URL of the utility bill photo",
                },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: "Extracted billing data",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  billing_start_date: {type: "string", example: "2026-04-17"},
                  billing_end_date: {type: "string", example: "2026-05-17"},
                  billing_consumption: {type: "number", example: 350},
                  billing_rate: {type: "number", example: 12.5},
                  raw_amount: {type: "number", example: 4375},
                },
              },
            },
          },
        },
        422: {description: "Could not extract data from the image"},
        401: {description: "Unauthorized"},
        500: {description: "Internal server error"},
      },
      security: [{BearerAuth: []}],
    },
  },
  "/billing-cycles/batch": {
    post: {
      tags: ["Billing Cycles"],
      summary: "Create multiple billing cycles",
      description: "Batch create 1-10 billing cycles. Each cycle is validated and created " +
        "independently: an invalid or duplicate item is reported per-index in `failed` rather " +
        "than aborting the whole batch, so other valid cycles are still created.",
      security: [{BearerAuth: []}],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "array",
              items: {
                $ref: "#/components/schemas/CreateBillingCycleRequest",
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
                    items: {$ref: "#/components/schemas/BillingCycle"},
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
      tags: ["Billing Cycles"],
      summary: "Update multiple billing cycles",
      description: "Batch update 1-10 billing cycles.",
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
                    $ref: "#/components/schemas/UpdateBillingCycleRequest",
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
          description: "Billing cycles updated",
          content: {
            "application/json": {
              schema: {
                type: "array",
                items: {
                  $ref: "#/components/schemas/BillingCycle",
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
          description: "Billing cycle or billing not found",
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
  "/billing-cycles/{id}": {
    get: {
      tags: ["Billing Cycles"],
      summary: "Get billing cycle by ID",
      description: "Retrieve a single billing cycle by ID.",
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
          description: "Billing cycle retrieved",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/BillingCycle",
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
          description: "Billing cycle not found",
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
      tags: ["Billing Cycles"],
      summary: "Update a billing cycle",
      description: "Update a single billing cycle.",
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
              $ref: "#/components/schemas/UpdateBillingCycleRequest",
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Billing cycle updated",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/BillingCycle",
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
          description: "Billing cycle or billing not found",
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
      tags: ["Billing Cycles"],
      summary: "Delete a billing cycle (hard delete)",
      description: "Permanently delete a billing cycle.",
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
          description: "Billing cycle deleted",
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
          description: "Billing cycle not found",
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
  "/billing-cycles/soft/{id}": {
    delete: {
      tags: ["Billing Cycles"],
      summary: "Soft delete a billing cycle",
      description: "Soft delete (mark as deleted) a billing cycle.",
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
          description: "Billing cycle soft deleted",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/BillingCycle",
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
          description: "Billing cycle not found",
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
