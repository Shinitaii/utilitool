import {Express} from "express";
import swaggerUi from "swagger-ui-express";

import {authPaths} from "../features/auth/auth.swagger";
import {meterGroupPaths} from "../features/meter-group/meter-group.swagger";
import {propertyPaths} from "../features/property/property.swagger";
import {tenantPaths} from "../features/tenant/tenant.swagger";
import {readingPaths} from "../features/reading/reading.swagger";
import {billingPaths} from "../features/billing/billing.swagger";
import {billingCyclePaths} from "../features/billing-cycle/billing-cycle.swagger";
import {billsPaths} from "../features/bills/bills.swagger";
import {paths as imageExtractionPaths} from "../features/image-extraction/image-extraction.swagger";
import {reportsPaths} from "../features/reports/reports.swagger";
import {llmConfigPaths} from "../features/llm-config/llm-config.swagger";
import {chatbotPaths} from "../features/chatbot/chatbot.swagger";

const swaggerSpec = {
  openapi: "3.0.3",
  info: {
    title: "Utilitool API",
    description: "Utility meter reading and billing management system",
    version: "1.0.0",
    contact: {
      name: "Utilitool Support",
    },
  },
  servers: [
    {
      // Resolves to the deployed API base in staging (set SWAGGER_SERVER_URL in
      // secrets/.env.<env>); falls back to the local emulator URL for dev.
      url: process.env.SWAGGER_SERVER_URL ?? "http://localhost:5002",
      description: process.env.SWAGGER_SERVER_URL ?
        "Configured environment" :
        "Local development (Firebase Emulator)",
    },
  ],
  components: {
    schemas: {
      Timestamp: {
        type: "object",
        description: "Firestore Timestamp object",
        properties: {
          _seconds: {
            type: "integer",
            description: "Seconds since epoch",
          },
          _nanoseconds: {
            type: "integer",
            description: "Nanoseconds component",
          },
        },
        required: ["_seconds", "_nanoseconds"],
      },
      BaseModel: {
        type: "object",
        description: "Base fields present on all models",
        properties: {
          id: {
            type: "string",
            description: "Firestore document ID",
          },
          created_at: {
            $ref: "#/components/schemas/Timestamp",
          },
          updated_at: {
            $ref: "#/components/schemas/Timestamp",
            description: "Omitted if never updated",
          },
          deleted_at: {
            $ref: "#/components/schemas/Timestamp",
            description: "Present only on soft-deleted records",
          },
        },
        required: ["id", "created_at"],
      },
      PaginatedMeta: {
        type: "object",
        description: "Pagination metadata for list responses",
        properties: {
          nextCursor: {
            type: ["string", "null"],
            description: "Cursor for next page; null if no more results",
          },
          hasMore: {
            type: "boolean",
            description: "Whether more results exist",
          },
        },
        required: ["nextCursor", "hasMore"],
      },
      ErrorResponse: {
        type: "object",
        description: "Standard error response (AppError)",
        properties: {
          error: {
            type: "string",
          },
        },
        required: ["error"],
      },
      ZodIssue: {
        type: "object",
        description: "Zod validation error",
        properties: {
          code: {
            type: "string",
          },
          message: {
            type: "string",
          },
          path: {
            type: "array",
            items: {
              type: "string",
            },
          },
        },
        required: ["code", "message", "path"],
      },
      ValidationErrorResponse: {
        type: "object",
        description: "Validation error response (Zod)",
        properties: {
          error: {
            type: "array",
            items: {
              $ref: "#/components/schemas/ZodIssue",
            },
          },
        },
        required: ["error"],
      },
      // Auth
      UserProfile: {
        type: "object",
        properties: {
          userId: {
            type: "string",
          },
          email: {
            type: "string",
            format: "email",
          },
          display_name: {
            type: "string",
          },
          role: {
            type: "string",
            enum: ["admin", "landlord", "assistant"],
          },
          qr_payment_url: {
            type: "string",
            format: "uri",
            description: "URL of the landlord's GCash/Maya payment QR code image",
          },
        },
        required: ["userId", "email", "display_name", "role"],
      },
      UpdateUserProfile: {
        type: "object",
        properties: {
          display_name: {
            type: "string",
            minLength: 1,
            maxLength: 255,
          },
          qr_payment_url: {
            type: "string",
            format: "uri",
            description: "URL of the landlord's GCash/Maya payment QR code image",
          },
        },
      },
      // Meter Group
      MeterGroup: {
        allOf: [
          {
            $ref: "#/components/schemas/BaseModel",
          },
          {
            type: "object",
            properties: {
              meter_name: {
                type: "string",
                description: "Meter group name (1-255 chars, HTML stripped)",
              },
              utility_type: {
                type: "string",
                enum: ["electricity", "water"],
              },
              current_version: {
                type: "integer",
                description: "Current meter counter version (1-based, increments on each reset)",
              },
              versions: {
                type: "object",
                description: "Reset history keyed by version number",
                additionalProperties: {
                  type: "object",
                  properties: {
                    reset_at: {
                      type: "object",
                    },
                    last_reading: {
                      type: "number",
                    },
                  },
                },
              },
            },
            required: ["meter_name", "utility_type"],
          },
        ],
      },
      CreateMeterGroupRequest: {
        type: "object",
        properties: {
          meter_name: {
            type: "string",
            minLength: 1,
            maxLength: 255,
          },
          utility_type: {
            type: "string",
            enum: ["electricity", "water"],
          },
        },
        required: ["meter_name", "utility_type"],
      },
      UpdateMeterGroupRequest: {
        type: "object",
        properties: {
          meter_name: {
            type: "string",
            minLength: 1,
            maxLength: 255,
          },
          utility_type: {
            type: "string",
            enum: ["electricity", "water"],
          },
        },
      },
      PaginatedMeterGroups: {
        type: "object",
        properties: {
          data: {
            type: "array",
            items: {
              $ref: "#/components/schemas/MeterGroup",
            },
          },
          nextCursor: {
            type: ["string", "null"],
          },
          hasMore: {
            type: "boolean",
          },
        },
        required: ["data", "nextCursor", "hasMore"],
      },
      // Property
      Property: {
        allOf: [
          {
            $ref: "#/components/schemas/BaseModel",
          },
          {
            type: "object",
            properties: {
              room_name: {
                type: "string",
              },
              tenant_amount: {
                type: "integer",
                minimum: 1,
              },
              meter_groups: {
                type: "object",
                description:
                  "Keyed by utility type (electricity, water); each entry links the property to a meter group and marks whether it's the main meter.",
                additionalProperties: {
                  type: "object",
                  properties: {
                    meter_group_id: {
                      type: "string",
                      minLength: 1,
                    },
                    is_main_meter: {
                      type: "boolean",
                    },
                  },
                  required: ["meter_group_id", "is_main_meter"],
                },
              },
            },
            required: ["room_name", "tenant_amount", "meter_groups"],
          },
        ],
      },
      CreatePropertyRequest: {
        type: "object",
        properties: {
          room_name: {
            type: "string",
            minLength: 1,
            maxLength: 255,
          },
          tenant_amount: {
            type: "integer",
            minimum: 1,
          },
          meter_groups: {
            type: "object",
            description:
              "Keyed by utility type (electricity, water); at least one entry is required.",
            additionalProperties: {
              type: "object",
              properties: {
                meter_group_id: {
                  type: "string",
                  minLength: 1,
                },
                is_main_meter: {
                  type: "boolean",
                },
              },
              required: ["meter_group_id", "is_main_meter"],
            },
          },
        },
        required: ["room_name", "tenant_amount", "meter_groups"],
      },
      UpdatePropertyRequest: {
        type: "object",
        properties: {
          room_name: {
            type: "string",
            minLength: 1,
            maxLength: 255,
          },
          tenant_amount: {
            type: "integer",
            minimum: 1,
          },
          meter_groups: {
            type: "object",
            description:
              "Keyed by utility type (electricity, water); at least one entry is required.",
            additionalProperties: {
              type: "object",
              properties: {
                meter_group_id: {
                  type: "string",
                  minLength: 1,
                },
                is_main_meter: {
                  type: "boolean",
                },
              },
              required: ["meter_group_id", "is_main_meter"],
            },
          },
        },
      },
      PaginatedProperties: {
        type: "object",
        properties: {
          data: {
            type: "array",
            items: {
              $ref: "#/components/schemas/Property",
            },
          },
          nextCursor: {
            type: ["string", "null"],
          },
          hasMore: {
            type: "boolean",
          },
        },
        required: ["data", "nextCursor", "hasMore"],
      },
      // Tenant
      Tenant: {
        allOf: [
          {
            $ref: "#/components/schemas/BaseModel",
          },
          {
            type: "object",
            properties: {
              tenant_name: {
                type: "string",
              },
              property_id: {
                type: "string",
              },
            },
            required: ["tenant_name", "property_id"],
          },
        ],
      },
      CreateTenantRequest: {
        type: "object",
        properties: {
          tenant_name: {
            type: "string",
            minLength: 1,
            maxLength: 255,
          },
          property_id: {
            type: "string",
            minLength: 1,
          },
        },
        required: ["tenant_name", "property_id"],
      },
      UpdateTenantRequest: {
        type: "object",
        properties: {
          tenant_name: {
            type: "string",
            minLength: 1,
            maxLength: 255,
          },
          property_id: {
            type: "string",
            minLength: 1,
          },
        },
      },
      PaginatedTenants: {
        type: "object",
        properties: {
          data: {
            type: "array",
            items: {
              $ref: "#/components/schemas/Tenant",
            },
          },
          nextCursor: {
            type: ["string", "null"],
          },
          hasMore: {
            type: "boolean",
          },
        },
        required: ["data", "nextCursor", "hasMore"],
      },
      // Reading
      Reading: {
        allOf: [
          {
            $ref: "#/components/schemas/BaseModel",
          },
          {
            type: "object",
            properties: {
              meter_group_id: {
                type: "string",
              },
              property_id: {
                type: "string",
              },
              reading_amount: {
                type: "integer",
                minimum: 0,
              },
              reading_date: {
                $ref: "#/components/schemas/Timestamp",
              },
              image_url: {
                type: "string",
                format: "uri",
                description: "Optional photo of the meter (requires Firebase Storage)",
              },
              meter_version: {
                type: "integer",
                minimum: 1,
                description: "Server-set version number from the meter group. Incremented on each physical meter reset.",
              },
            },
            required: ["meter_group_id", "property_id", "reading_amount", "reading_date"],
          },
        ],
      },
      CreateReadingRequest: {
        type: "object",
        properties: {
          meter_group_id: {
            type: "string",
            minLength: 1,
          },
          property_id: {
            type: "string",
            minLength: 1,
          },
          reading_amount: {
            type: "integer",
            minimum: 0,
          },
          reading_date: {
            $ref: "#/components/schemas/Timestamp",
          },
          image_url: {
            type: "string",
            format: "uri",
            description: "Optional photo URL (requires Firebase Storage to be configured)",
          },
        },
        required: ["meter_group_id", "property_id", "reading_amount", "reading_date"],
      },
      UpdateReadingRequest: {
        type: "object",
        properties: {
          meter_group_id: {
            type: "string",
            minLength: 1,
          },
          property_id: {
            type: "string",
            minLength: 1,
          },
          reading_amount: {
            type: "integer",
            minimum: 0,
          },
          reading_date: {
            $ref: "#/components/schemas/Timestamp",
          },
          image_url: {
            type: "string",
            format: "uri",
          },
        },
      },
      PaginatedReadings: {
        type: "object",
        properties: {
          data: {
            type: "array",
            items: {
              $ref: "#/components/schemas/Reading",
            },
          },
          nextCursor: {
            type: ["string", "null"],
          },
          hasMore: {
            type: "boolean",
          },
        },
        required: ["data", "nextCursor", "hasMore"],
      },
      // Billing
      Billing: {
        allOf: [
          {
            $ref: "#/components/schemas/BaseModel",
          },
          {
            type: "object",
            properties: {
              property_id: {
                type: "string",
              },
              previous_reading_id: {
                type: "string",
              },
              current_reading_id: {
                type: "string",
              },
              payment_status: {
                type: "string",
                enum: ["pending", "paid"],
                description: "Payment status of the billing",
              },
              paid_at: {
                type: "string",
                format: "date-time",
                description: "ISO 8601 timestamp when billing was marked as paid",
              },
            },
            required: ["property_id", "previous_reading_id", "current_reading_id", "payment_status"],
          },
        ],
      },
      CreateBillingRequest: {
        type: "object",
        properties: {
          property_id: {
            type: "string",
            minLength: 1,
          },
          previous_reading_id: {
            type: "string",
            minLength: 1,
          },
          current_reading_id: {
            type: "string",
            minLength: 1,
          },
        },
        required: ["property_id", "previous_reading_id", "current_reading_id"],
      },
      UpdateBillingRequest: {
        type: "object",
        properties: {
          property_id: {
            type: "string",
            minLength: 1,
          },
          previous_reading_id: {
            type: "string",
            minLength: 1,
          },
          current_reading_id: {
            type: "string",
            minLength: 1,
          },
          payment_status: {
            type: "string",
            enum: ["pending", "paid"],
          },
          paid_at: {
            type: "string",
            format: "date-time",
          },
        },
      },
      PaginatedBillings: {
        type: "object",
        properties: {
          data: {
            type: "array",
            items: {
              $ref: "#/components/schemas/Billing",
            },
          },
          nextCursor: {
            type: ["string", "null"],
          },
          hasMore: {
            type: "boolean",
          },
        },
        required: ["data", "nextCursor", "hasMore"],
      },
      // Billing Cycle
      BillingCycle: {
        allOf: [
          {
            $ref: "#/components/schemas/BaseModel",
          },
          {
            type: "object",
            properties: {
              billing_ids: {
                type: "object",
                additionalProperties: {
                  type: "number",
                  minimum: 0,
                },
                description: "Map of billing ID to consumption amount. Must not be empty.",
              },
              billing_rate: {
                type: "number",
                minimum: 0,
              },
              billing_consumption: {
                type: "number",
                minimum: 0,
              },
              billing_start_date: {
                $ref: "#/components/schemas/Timestamp",
              },
              billing_end_date: {
                $ref: "#/components/schemas/Timestamp",
              },
              overdue_date: {
                $ref: "#/components/schemas/Timestamp",
              },
            },
            required: [
              "billing_ids",
              "billing_rate",
              "billing_consumption",
              "billing_start_date",
              "billing_end_date",
            ],
          },
        ],
      },
      CreateBillingCycleRequest: {
        type: "object",
        properties: {
          billing_ids: {
            type: "object",
            additionalProperties: {
              type: "number",
              minimum: 0,
            },
            description: "Map of billing ID to consumption amount. Must not be empty.",
          },
          billing_rate: {
            type: "number",
            minimum: 0,
          },
          billing_consumption: {
            type: "number",
            minimum: 0,
          },
          billing_start_date: {
            $ref: "#/components/schemas/Timestamp",
          },
          billing_end_date: {
            $ref: "#/components/schemas/Timestamp",
          },
          overdue_date: {
            $ref: "#/components/schemas/Timestamp",
          },
        },
        required: [
          "billing_ids",
          "billing_rate",
          "billing_consumption",
          "billing_start_date",
          "billing_end_date",
        ],
      },
      UpdateBillingCycleRequest: {
        type: "object",
        properties: {
          billing_ids: {
            type: "object",
            additionalProperties: {
              type: "number",
              minimum: 0,
            },
          },
          billing_rate: {
            type: "number",
            minimum: 0,
          },
          billing_consumption: {
            type: "number",
            minimum: 0,
          },
          billing_start_date: {
            $ref: "#/components/schemas/Timestamp",
          },
          billing_end_date: {
            $ref: "#/components/schemas/Timestamp",
          },
          overdue_date: {
            $ref: "#/components/schemas/Timestamp",
          },
        },
      },
      PaginatedBillingCycles: {
        type: "object",
        properties: {
          data: {
            type: "array",
            items: {
              $ref: "#/components/schemas/BillingCycle",
            },
          },
          nextCursor: {
            type: ["string", "null"],
          },
          hasMore: {
            type: "boolean",
          },
        },
        required: ["data", "nextCursor", "hasMore"],
      },
      // Reports
      ReportSummary: {
        type: "object",
        properties: {
          total_revenue: {
            type: "number",
            description: "Total amount collected",
          },
          total_billed: {
            type: "number",
            description: "Total amount billed",
          },
          collection_rate: {
            type: "number",
            description: "Collection rate (0-1)",
          },
          paid_count: {
            type: "integer",
            description: "Number of paid billings",
          },
          pending_count: {
            type: "integer",
            description: "Number of pending billings",
          },
          overdue_count: {
            type: "integer",
            description: "Number of overdue billings",
          },
          pending_amount: {
            type: "number",
            description: "Total pending amount",
          },
          overdue_amount: {
            type: "number",
            description: "Total overdue amount",
          },
        },
        required: ["total_revenue", "total_billed", "collection_rate", "paid_count", "pending_count", "overdue_count", "pending_amount", "overdue_amount"],
      },
      ConsumptionByMonth: {
        type: "object",
        properties: {
          period: {
            type: "string",
            description: "Year-month (YYYY-MM)",
          },
          electricity: {
            type: "number",
          },
          water: {
            type: "number",
          },
        },
        required: ["period", "electricity", "water"],
      },
      ConsumptionByProperty: {
        type: "object",
        properties: {
          property_id: {
            type: "string",
          },
          room_name: {
            type: "string",
          },
          electricity: {
            type: "number",
          },
          water: {
            type: "number",
          },
        },
        required: ["property_id", "room_name", "electricity", "water"],
      },
      ConsumptionReport: {
        type: "object",
        properties: {
          by_month: {
            type: "array",
            items: {
              $ref: "#/components/schemas/ConsumptionByMonth",
            },
          },
          by_property: {
            type: "array",
            items: {
              $ref: "#/components/schemas/ConsumptionByProperty",
            },
          },
        },
        required: ["by_month", "by_property"],
      },
      BillingTrendByMonth: {
        type: "object",
        properties: {
          period: {
            type: "string",
            description: "Year-month (YYYY-MM)",
          },
          total_billed: {
            type: "number",
          },
          total_collected: {
            type: "number",
          },
          total_pending: {
            type: "number",
          },
          total_overdue: {
            type: "number",
          },
        },
        required: ["period", "total_billed", "total_collected", "total_pending", "total_overdue"],
      },
      BillingTrendsReport: {
        type: "object",
        properties: {
          by_month: {
            type: "array",
            items: {
              $ref: "#/components/schemas/BillingTrendByMonth",
            },
          },
        },
        required: ["by_month"],
      },
      CollectionStatusItem: {
        type: "object",
        properties: {
          count: {
            type: "integer",
          },
          amount: {
            type: "number",
          },
        },
        required: ["count", "amount"],
      },
      CollectionStatusReport: {
        type: "object",
        properties: {
          paid: {
            $ref: "#/components/schemas/CollectionStatusItem",
          },
          pending: {
            $ref: "#/components/schemas/CollectionStatusItem",
          },
          overdue: {
            $ref: "#/components/schemas/CollectionStatusItem",
          },
        },
        required: ["paid", "pending", "overdue"],
      },
      OcrBillRequest: {
        type: "object",
        required: ["image_url"],
        properties: {
          image_url: {
            type: "string",
            format: "uri",
            description: "URL of the bill image to process",
            example: "https://storage.googleapis.com/bucket/bills/bill.jpg",
          },
        },
      },
      LlmConfigResponse: {
        type: "object",
        properties: {
          provider: {
            type: ["string", "null"],
            enum: ["groq", "ollama_cloud", null],
            description: "Chat provider, used by the insight chatbot.",
          },
          model: {
            type: ["string", "null"],
          },
          hasKey: {
            type: "boolean",
          },
          visionProvider: {
            type: ["string", "null"],
            enum: ["groq", "ollama_cloud", null],
            description: "Vision (OCR) provider — independent from the chat provider. Some providers have no usable free vision model.",
          },
          visionModel: {
            type: ["string", "null"],
            description: "Vision-capable model used for OCR (meter readings, bill photos). Required for OCR endpoints — no Gemini fallback.",
          },
          visionHasKey: {
            type: "boolean",
            description: "True once a vision config is usable — either via its own stored key, or by reusing the chat API key when visionProvider === provider.",
          },
        },
        required: ["provider", "model", "hasKey", "visionProvider", "visionModel", "visionHasKey"],
      },
      UpsertLlmConfigRequest: {
        type: "object",
        properties: {
          provider: {
            type: "string",
            enum: ["groq", "ollama_cloud"],
          },
          model: {
            type: "string",
            minLength: 1,
            maxLength: 255,
          },
          apiKey: {
            type: "string",
            minLength: 0,
            maxLength: 500,
            description: "Plaintext API key — encrypted server-side before storage, never returned. Optional: omit to keep the existing stored key.",
          },
        },
        required: ["provider", "model"],
      },
      UpsertVisionLlmConfigRequest: {
        type: "object",
        properties: {
          provider: {
            type: "string",
            enum: ["groq", "ollama_cloud"],
          },
          model: {
            type: "string",
            minLength: 1,
            maxLength: 255,
          },
          apiKey: {
            type: "string",
            minLength: 0,
            maxLength: 500,
            description: "Plaintext API key — encrypted server-side before storage, never returned. Optional when provider matches the chat provider (the chat key is reused); required when it differs and no key is already stored for that provider.",
          },
        },
        required: ["provider", "model"],
      },
      ChatHistoryMessage: {
        type: "object",
        properties: {
          role: {
            type: "string",
            enum: ["user", "assistant"],
          },
          content: {
            type: "string",
            minLength: 1,
            maxLength: 2000,
          },
        },
        required: ["role", "content"],
      },
      ChatRequest: {
        type: "object",
        properties: {
          message: {
            type: "string",
            minLength: 1,
            maxLength: 2000,
          },
          history: {
            type: "array",
            maxItems: 20,
            description: "Prior turns from the client's own message list — not persisted server-side.",
            items: {$ref: "#/components/schemas/ChatHistoryMessage"},
          },
        },
        required: ["message"],
      },
      ChatResponse: {
        type: "object",
        properties: {
          reply: {
            type: "string",
          },
        },
        required: ["reply"],
      },
      OcrBillResponse: {
        type: "object",
        properties: {
          billing_start_date: {
            type: "string",
            format: "date",
            description: "Start date of the billing period (YYYY-MM-DD)",
            example: "2026-04-17",
          },
          billing_end_date: {
            type: "string",
            format: "date",
            description: "End date of the billing period (YYYY-MM-DD)",
            example: "2026-05-16",
          },
          billing_consumption: {
            type: "number",
            description: "Total consumption in kWh or cubic meters",
            example: 145.5,
          },
          billing_rate: {
            type: "number",
            description: "Rate per unit (PHP/kWh or PHP/cubic meter)",
            example: 12.5,
          },
          raw_amount: {
            type: "number",
            description: "Total amount charged",
            example: 1818.75,
          },
        },
      },
    },
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "JWT bearer token required for all protected endpoints",
      },
    },
  },
  paths: {
    ...authPaths,
    ...meterGroupPaths,
    ...propertyPaths,
    ...tenantPaths,
    ...readingPaths,
    ...billingPaths,
    ...billingCyclePaths,
    ...billsPaths,
    ...imageExtractionPaths,
    ...reportsPaths,
    ...llmConfigPaths,
    ...chatbotPaths,
  },
};

export function setupSwagger(app: Express): void {
  // Hide API docs in production (APP_ENV value matches secrets/.env.production)
  if (process.env.APP_ENV === "production") {
    return;
  }
  app.use("/docs", swaggerUi.serve);
  app.get("/docs", swaggerUi.setup(swaggerSpec));
  app.get("/docs/swagger.json", (_req, res) => {
    res.json(swaggerSpec);
  });
}

export {swaggerSpec};
