import { Express } from 'express';
import swaggerUi from 'swagger-ui-express';

import { authPaths } from '../features/auth/auth.swagger';
import { meterGroupPaths } from '../features/meter-group/meter-group.swagger';
import { propertyPaths } from '../features/property/property.swagger';
import { tenantPaths } from '../features/tenant/tenant.swagger';
import { readingPaths } from '../features/reading/reading.swagger';
import { billingPaths } from '../features/billing/billing.swagger';
import { billingCyclePaths } from '../features/billing-cycle/billing-cycle.swagger';

const swaggerSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Utilitool API',
    description: 'Utility meter reading and billing management system',
    version: '1.0.0',
    contact: {
      name: 'Utilitool Support',
    },
  },
  servers: [
    {
      url: 'http://localhost:5002',
      description: 'Local development (Firebase Emulator)',
    },
    {
      url: 'https://utilitool-staging.firebaseapp.com',
      description: 'Staging environment',
    },
  ],
  components: {
    schemas: {
      Timestamp: {
        type: 'object',
        description: 'Firestore Timestamp object',
        properties: {
          _seconds: {
            type: 'integer',
            description: 'Seconds since epoch',
          },
          _nanoseconds: {
            type: 'integer',
            description: 'Nanoseconds component',
          },
        },
        required: ['_seconds', '_nanoseconds'],
      },
      BaseModel: {
        type: 'object',
        description: 'Base fields present on all models',
        properties: {
          id: {
            type: 'string',
            description: 'Firestore document ID',
          },
          created_at: {
            $ref: '#/components/schemas/Timestamp',
          },
          updated_at: {
            $ref: '#/components/schemas/Timestamp',
            description: 'Omitted if never updated',
          },
          deleted_at: {
            $ref: '#/components/schemas/Timestamp',
            description: 'Present only on soft-deleted records',
          },
        },
        required: ['id', 'created_at'],
      },
      PaginatedMeta: {
        type: 'object',
        description: 'Pagination metadata for list responses',
        properties: {
          nextCursor: {
            type: ['string', 'null'],
            description: 'Cursor for next page; null if no more results',
          },
          hasMore: {
            type: 'boolean',
            description: 'Whether more results exist',
          },
        },
        required: ['nextCursor', 'hasMore'],
      },
      ErrorResponse: {
        type: 'object',
        description: 'Standard error response (AppError)',
        properties: {
          error: {
            type: 'string',
          },
        },
        required: ['error'],
      },
      ZodIssue: {
        type: 'object',
        description: 'Zod validation error',
        properties: {
          code: {
            type: 'string',
          },
          message: {
            type: 'string',
          },
          path: {
            type: 'array',
            items: {
              type: 'string',
            },
          },
        },
        required: ['code', 'message', 'path'],
      },
      ValidationErrorResponse: {
        type: 'object',
        description: 'Validation error response (Zod)',
        properties: {
          error: {
            type: 'array',
            items: {
              $ref: '#/components/schemas/ZodIssue',
            },
          },
        },
        required: ['error'],
      },
      // Auth
      LoginRequest: {
        type: 'object',
        properties: {
          email: {
            type: 'string',
            format: 'email',
          },
          password: {
            type: 'string',
            minLength: 8,
          },
        },
        required: ['email', 'password'],
      },
      RegisterRequest: {
        type: 'object',
        properties: {
          email: {
            type: 'string',
            format: 'email',
          },
          password: {
            type: 'string',
            minLength: 8,
          },
        },
        required: ['email', 'password'],
      },
      RefreshRequest: {
        type: 'object',
        properties: {
          refresh_token: {
            type: 'string',
            minLength: 1,
          },
        },
        required: ['refresh_token'],
      },
      AuthResponse: {
        type: 'object',
        properties: {
          access_token: {
            type: 'string',
          },
          refresh_token: {
            type: 'string',
            description: 'Present in login/register only',
          },
          expires_in: {
            type: 'integer',
            description: 'Token expiration time in seconds',
          },
          token_type: {
            type: 'string',
            enum: ['Bearer'],
          },
        },
        required: ['access_token', 'expires_in', 'token_type'],
      },
      // Meter Group
      MeterGroup: {
        allOf: [
          {
            $ref: '#/components/schemas/BaseModel',
          },
          {
            type: 'object',
            properties: {
              meter_name: {
                type: 'string',
                description: 'Meter group name (1-255 chars, HTML stripped)',
              },
              utility_type: {
                type: 'string',
                enum: ['electricity', 'water'],
              },
            },
            required: ['meter_name', 'utility_type'],
          },
        ],
      },
      CreateMeterGroupRequest: {
        type: 'object',
        properties: {
          meter_name: {
            type: 'string',
            minLength: 1,
            maxLength: 255,
          },
          utility_type: {
            type: 'string',
            enum: ['electricity', 'water'],
          },
        },
        required: ['meter_name', 'utility_type'],
      },
      UpdateMeterGroupRequest: {
        type: 'object',
        properties: {
          meter_name: {
            type: 'string',
            minLength: 1,
            maxLength: 255,
          },
          utility_type: {
            type: 'string',
            enum: ['electricity', 'water'],
          },
        },
      },
      PaginatedMeterGroups: {
        type: 'object',
        properties: {
          data: {
            type: 'array',
            items: {
              $ref: '#/components/schemas/MeterGroup',
            },
          },
          nextCursor: {
            type: ['string', 'null'],
          },
          hasMore: {
            type: 'boolean',
          },
        },
        required: ['data', 'nextCursor', 'hasMore'],
      },
      // Property
      Property: {
        allOf: [
          {
            $ref: '#/components/schemas/BaseModel',
          },
          {
            type: 'object',
            properties: {
              room_name: {
                type: 'string',
              },
              tenant_amount: {
                type: 'integer',
                minimum: 1,
              },
              meter_group_id: {
                type: 'string',
              },
            },
            required: ['room_name', 'tenant_amount', 'meter_group_id'],
          },
        ],
      },
      CreatePropertyRequest: {
        type: 'object',
        properties: {
          room_name: {
            type: 'string',
            minLength: 1,
            maxLength: 255,
          },
          tenant_amount: {
            type: 'integer',
            minimum: 1,
          },
          meter_group_id: {
            type: 'string',
            minLength: 1,
          },
        },
        required: ['room_name', 'tenant_amount', 'meter_group_id'],
      },
      UpdatePropertyRequest: {
        type: 'object',
        properties: {
          room_name: {
            type: 'string',
            minLength: 1,
            maxLength: 255,
          },
          tenant_amount: {
            type: 'integer',
            minimum: 1,
          },
          meter_group_id: {
            type: 'string',
            minLength: 1,
          },
        },
      },
      PaginatedProperties: {
        type: 'object',
        properties: {
          data: {
            type: 'array',
            items: {
              $ref: '#/components/schemas/Property',
            },
          },
          nextCursor: {
            type: ['string', 'null'],
          },
          hasMore: {
            type: 'boolean',
          },
        },
        required: ['data', 'nextCursor', 'hasMore'],
      },
      // Tenant
      Tenant: {
        allOf: [
          {
            $ref: '#/components/schemas/BaseModel',
          },
          {
            type: 'object',
            properties: {
              tenant_name: {
                type: 'string',
              },
              property_id: {
                type: 'string',
              },
            },
            required: ['tenant_name', 'property_id'],
          },
        ],
      },
      CreateTenantRequest: {
        type: 'object',
        properties: {
          tenant_name: {
            type: 'string',
            minLength: 1,
            maxLength: 255,
          },
          property_id: {
            type: 'string',
            minLength: 1,
          },
        },
        required: ['tenant_name', 'property_id'],
      },
      UpdateTenantRequest: {
        type: 'object',
        properties: {
          tenant_name: {
            type: 'string',
            minLength: 1,
            maxLength: 255,
          },
          property_id: {
            type: 'string',
            minLength: 1,
          },
        },
      },
      PaginatedTenants: {
        type: 'object',
        properties: {
          data: {
            type: 'array',
            items: {
              $ref: '#/components/schemas/Tenant',
            },
          },
          nextCursor: {
            type: ['string', 'null'],
          },
          hasMore: {
            type: 'boolean',
          },
        },
        required: ['data', 'nextCursor', 'hasMore'],
      },
      // Reading
      Reading: {
        allOf: [
          {
            $ref: '#/components/schemas/BaseModel',
          },
          {
            type: 'object',
            properties: {
              meter_group_id: {
                type: 'string',
              },
              reading_amount: {
                type: 'integer',
                minimum: 0,
              },
              reading_date: {
                $ref: '#/components/schemas/Timestamp',
              },
            },
            required: ['meter_group_id', 'reading_amount', 'reading_date'],
          },
        ],
      },
      CreateReadingRequest: {
        type: 'object',
        properties: {
          meter_group_id: {
            type: 'string',
            minLength: 1,
          },
          reading_amount: {
            type: 'integer',
            minimum: 0,
          },
          reading_date: {
            $ref: '#/components/schemas/Timestamp',
          },
        },
        required: ['meter_group_id', 'reading_amount', 'reading_date'],
      },
      UpdateReadingRequest: {
        type: 'object',
        properties: {
          meter_group_id: {
            type: 'string',
            minLength: 1,
          },
          reading_amount: {
            type: 'integer',
            minimum: 0,
          },
          reading_date: {
            $ref: '#/components/schemas/Timestamp',
          },
        },
      },
      PaginatedReadings: {
        type: 'object',
        properties: {
          data: {
            type: 'array',
            items: {
              $ref: '#/components/schemas/Reading',
            },
          },
          nextCursor: {
            type: ['string', 'null'],
          },
          hasMore: {
            type: 'boolean',
          },
        },
        required: ['data', 'nextCursor', 'hasMore'],
      },
      // Billing
      Billing: {
        allOf: [
          {
            $ref: '#/components/schemas/BaseModel',
          },
          {
            type: 'object',
            properties: {
              property_id: {
                type: 'string',
              },
              previous_reading_id: {
                type: 'string',
              },
              current_reading_id: {
                type: 'string',
              },
            },
            required: ['property_id', 'previous_reading_id', 'current_reading_id'],
          },
        ],
      },
      CreateBillingRequest: {
        type: 'object',
        properties: {
          property_id: {
            type: 'string',
            minLength: 1,
          },
          previous_reading_id: {
            type: 'string',
            minLength: 1,
          },
          current_reading_id: {
            type: 'string',
            minLength: 1,
          },
        },
        required: ['property_id', 'previous_reading_id', 'current_reading_id'],
      },
      UpdateBillingRequest: {
        type: 'object',
        properties: {
          property_id: {
            type: 'string',
            minLength: 1,
          },
          previous_reading_id: {
            type: 'string',
            minLength: 1,
          },
          current_reading_id: {
            type: 'string',
            minLength: 1,
          },
        },
      },
      PaginatedBillings: {
        type: 'object',
        properties: {
          data: {
            type: 'array',
            items: {
              $ref: '#/components/schemas/Billing',
            },
          },
          nextCursor: {
            type: ['string', 'null'],
          },
          hasMore: {
            type: 'boolean',
          },
        },
        required: ['data', 'nextCursor', 'hasMore'],
      },
      // Billing Cycle
      BillingCycle: {
        allOf: [
          {
            $ref: '#/components/schemas/BaseModel',
          },
          {
            type: 'object',
            properties: {
              billing_ids: {
                type: 'object',
                additionalProperties: {
                  type: 'number',
                },
                description: 'Map of billing ID to consumption amount',
              },
              billing_rate: {
                type: 'number',
                minimum: 0,
              },
              billing_consumption: {
                type: 'number',
                minimum: 0,
              },
              billing_start_date: {
                $ref: '#/components/schemas/Timestamp',
              },
              billing_end_date: {
                $ref: '#/components/schemas/Timestamp',
              },
            },
            required: [
              'billing_ids',
              'billing_rate',
              'billing_consumption',
              'billing_start_date',
              'billing_end_date',
            ],
          },
        ],
      },
      CreateBillingCycleRequest: {
        type: 'object',
        properties: {
          billing_ids: {
            type: 'object',
            additionalProperties: {
              type: 'number',
            },
          },
          billing_rate: {
            type: 'number',
            minimum: 0,
          },
          billing_consumption: {
            type: 'number',
            minimum: 0,
          },
          billing_start_date: {
            $ref: '#/components/schemas/Timestamp',
          },
          billing_end_date: {
            $ref: '#/components/schemas/Timestamp',
          },
        },
        required: [
          'billing_ids',
          'billing_rate',
          'billing_consumption',
          'billing_start_date',
          'billing_end_date',
        ],
      },
      UpdateBillingCycleRequest: {
        type: 'object',
        properties: {
          billing_ids: {
            type: 'object',
            additionalProperties: {
              type: 'number',
            },
          },
          billing_rate: {
            type: 'number',
            minimum: 0,
          },
          billing_consumption: {
            type: 'number',
            minimum: 0,
          },
          billing_start_date: {
            $ref: '#/components/schemas/Timestamp',
          },
          billing_end_date: {
            $ref: '#/components/schemas/Timestamp',
          },
        },
      },
      PaginatedBillingCycles: {
        type: 'object',
        properties: {
          data: {
            type: 'array',
            items: {
              $ref: '#/components/schemas/BillingCycle',
            },
          },
          nextCursor: {
            type: ['string', 'null'],
          },
          hasMore: {
            type: 'boolean',
          },
        },
        required: ['data', 'nextCursor', 'hasMore'],
      },
    },
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT bearer token required for all protected endpoints',
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
  },
};

export function setupSwagger(app: Express): void {
  app.use('/docs', swaggerUi.serve);
  app.get('/docs', swaggerUi.setup(swaggerSpec));
  app.get('/docs/swagger.json', (_req, res) => {
    res.json(swaggerSpec);
  });
}

export { swaggerSpec };
