export const reportsPaths = {
  "/reports/summary": {
    get: {
      tags: ["Reports"],
      summary: "Get billing summary report",
      description: "Retrieve key billing metrics: total revenue, collection rate, and payment status breakdown",
      security: [{BearerAuth: []}],
      parameters: [
        {
          name: "startDate",
          in: "query",
          description: "Filter cycles by start date (ISO 8601)",
          schema: {
            type: "string",
            format: "date-time",
          },
        },
        {
          name: "endDate",
          in: "query",
          description: "Filter cycles by end date (ISO 8601)",
          schema: {
            type: "string",
            format: "date-time",
          },
        },
        {
          name: "meterGroupId",
          in: "query",
          description: "Filter by specific meter group",
          schema: {
            type: "string",
          },
        },
        {
          name: "propertyId",
          in: "query",
          description: "Filter by specific property",
          schema: {
            type: "string",
          },
        },
      ],
      responses: {
        "200": {
          description: "Summary report data",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ReportSummary",
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
  "/reports/consumption": {
    get: {
      tags: ["Reports"],
      summary: "Get consumption analytics",
      description: "Retrieve consumption breakdown by month and by property",
      security: [{BearerAuth: []}],
      parameters: [
        {
          name: "startDate",
          in: "query",
          description: "Filter cycles by start date (ISO 8601)",
          schema: {
            type: "string",
            format: "date-time",
          },
        },
        {
          name: "endDate",
          in: "query",
          description: "Filter cycles by end date (ISO 8601)",
          schema: {
            type: "string",
            format: "date-time",
          },
        },
        {
          name: "meterGroupId",
          in: "query",
          description: "Filter by specific meter group",
          schema: {
            type: "string",
          },
        },
        {
          name: "propertyId",
          in: "query",
          description: "Filter by specific property",
          schema: {
            type: "string",
          },
        },
      ],
      responses: {
        "200": {
          description: "Consumption report data",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ConsumptionReport",
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
  "/reports/billing-trends": {
    get: {
      tags: ["Reports"],
      summary: "Get billing trends report",
      description: "Retrieve billing amounts (billed, collected, pending, overdue) grouped by month",
      security: [{BearerAuth: []}],
      parameters: [
        {
          name: "startDate",
          in: "query",
          description: "Filter cycles by start date (ISO 8601)",
          schema: {
            type: "string",
            format: "date-time",
          },
        },
        {
          name: "endDate",
          in: "query",
          description: "Filter cycles by end date (ISO 8601)",
          schema: {
            type: "string",
            format: "date-time",
          },
        },
        {
          name: "meterGroupId",
          in: "query",
          description: "Filter by specific meter group",
          schema: {
            type: "string",
          },
        },
        {
          name: "propertyId",
          in: "query",
          description: "Filter by specific property",
          schema: {
            type: "string",
          },
        },
      ],
      responses: {
        "200": {
          description: "Billing trends report data",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/BillingTrendsReport",
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
  "/reports/collection-status": {
    get: {
      tags: ["Reports"],
      summary: "Get collection status report",
      description: "Retrieve billing counts and amounts grouped by payment status (paid, pending, overdue)",
      security: [{BearerAuth: []}],
      parameters: [
        {
          name: "startDate",
          in: "query",
          description: "Filter cycles by start date (ISO 8601)",
          schema: {
            type: "string",
            format: "date-time",
          },
        },
        {
          name: "endDate",
          in: "query",
          description: "Filter cycles by end date (ISO 8601)",
          schema: {
            type: "string",
            format: "date-time",
          },
        },
        {
          name: "meterGroupId",
          in: "query",
          description: "Filter by specific meter group",
          schema: {
            type: "string",
          },
        },
        {
          name: "propertyId",
          in: "query",
          description: "Filter by specific property",
          schema: {
            type: "string",
          },
        },
      ],
      responses: {
        "200": {
          description: "Collection status report data",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/CollectionStatusReport",
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
};
