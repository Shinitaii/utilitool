import { PathsObject } from 'swagger-ui-express';

export const billingPaths: PathsObject = {
  '/billings': {
    post: {
      tags: ['Billings'],
      summary: 'Create a new billing record',
      description:
        'Create a single billing record linking a property to two readings (previous and current). Both readings must belong to the same meter group as the property.',
      security: [{ BearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/CreateBillingRequest',
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Billing created',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Billing',
              },
            },
          },
        },
        '400': {
          description:
            'Validation error (readings from different meter groups)',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ValidationErrorResponse',
              },
            },
          },
        },
        '401': {
          description: 'Unauthorized',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ErrorResponse',
              },
            },
          },
        },
        '404': {
          description: 'Property or reading not found',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ErrorResponse',
              },
            },
          },
        },
        '500': {
          description: 'Internal server error',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ErrorResponse',
              },
            },
          },
        },
      },
    },
    get: {
      tags: ['Billings'],
      summary: 'List billings',
      description:
        'Retrieve paginated list of billings. Can filter by property ID.',
      security: [{ BearerAuth: [] }],
      parameters: [
        {
          name: 'propertyId',
          in: 'query',
          description: 'Filter by property ID',
          schema: {
            type: 'string',
            minLength: 1,
          },
        },
        {
          name: 'limit',
          in: 'query',
          description: 'Number of results per page (1-100, default 20)',
          schema: {
            type: 'integer',
            minimum: 1,
            maximum: 100,
            default: 20,
          },
        },
        {
          name: 'cursor',
          in: 'query',
          description:
            'Pagination cursor from previous response. Cannot be combined with propertyId.',
          schema: {
            type: 'string',
          },
        },
      ],
      responses: {
        '200': {
          description: 'List of billings',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/PaginatedBillings',
              },
            },
          },
        },
        '400': {
          description: 'Validation error',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ValidationErrorResponse',
              },
            },
          },
        },
        '401': {
          description: 'Unauthorized',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ErrorResponse',
              },
            },
          },
        },
        '500': {
          description: 'Internal server error',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ErrorResponse',
              },
            },
          },
        },
      },
    },
  },
  '/billings/batch': {
    post: {
      tags: ['Billings'],
      summary: 'Create multiple billings',
      description: 'Batch create 1-10 billing records.',
      security: [{ BearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/CreateBillingRequest',
              },
              minItems: 1,
              maxItems: 10,
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Billings created',
          content: {
            'application/json': {
              schema: {
                type: 'array',
                items: {
                  $ref: '#/components/schemas/Billing',
                },
              },
            },
          },
        },
        '400': {
          description: 'Validation error',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ValidationErrorResponse',
              },
            },
          },
        },
        '401': {
          description: 'Unauthorized',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ErrorResponse',
              },
            },
          },
        },
        '404': {
          description: 'Property or reading not found',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ErrorResponse',
              },
            },
          },
        },
        '500': {
          description: 'Internal server error',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ErrorResponse',
              },
            },
          },
        },
      },
    },
    put: {
      tags: ['Billings'],
      summary: 'Update multiple billings',
      description: 'Batch update 1-10 billing records.',
      security: [{ BearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: {
                    type: 'string',
                  },
                  data: {
                    $ref: '#/components/schemas/UpdateBillingRequest',
                  },
                },
                required: ['id', 'data'],
              },
              minItems: 1,
              maxItems: 10,
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Billings updated',
          content: {
            'application/json': {
              schema: {
                type: 'array',
                items: {
                  $ref: '#/components/schemas/Billing',
                },
              },
            },
          },
        },
        '400': {
          description: 'Validation error',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ValidationErrorResponse',
              },
            },
          },
        },
        '401': {
          description: 'Unauthorized',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ErrorResponse',
              },
            },
          },
        },
        '404': {
          description: 'Billing, property, or reading not found',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ErrorResponse',
              },
            },
          },
        },
        '500': {
          description: 'Internal server error',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ErrorResponse',
              },
            },
          },
        },
      },
    },
  },
  '/billings/{id}': {
    get: {
      tags: ['Billings'],
      summary: 'Get billing by ID',
      description: 'Retrieve a single billing record by ID.',
      security: [{ BearerAuth: [] }],
      parameters: [
        {
          name: 'id',
          in: 'path',
          required: true,
          schema: {
            type: 'string',
            minLength: 1,
          },
        },
      ],
      responses: {
        '200': {
          description: 'Billing retrieved',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Billing',
              },
            },
          },
        },
        '401': {
          description: 'Unauthorized',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ErrorResponse',
              },
            },
          },
        },
        '404': {
          description: 'Billing not found',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ErrorResponse',
              },
            },
          },
        },
        '500': {
          description: 'Internal server error',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ErrorResponse',
              },
            },
          },
        },
      },
    },
    put: {
      tags: ['Billings'],
      summary: 'Update a billing record',
      description: 'Update a single billing record.',
      security: [{ BearerAuth: [] }],
      parameters: [
        {
          name: 'id',
          in: 'path',
          required: true,
          schema: {
            type: 'string',
            minLength: 1,
          },
        },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/UpdateBillingRequest',
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Billing updated',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Billing',
              },
            },
          },
        },
        '400': {
          description: 'Validation error',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ValidationErrorResponse',
              },
            },
          },
        },
        '401': {
          description: 'Unauthorized',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ErrorResponse',
              },
            },
          },
        },
        '404': {
          description: 'Billing, property, or reading not found',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ErrorResponse',
              },
            },
          },
        },
        '500': {
          description: 'Internal server error',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ErrorResponse',
              },
            },
          },
        },
      },
    },
    delete: {
      tags: ['Billings'],
      summary: 'Delete a billing record (hard delete)',
      description: 'Permanently delete a billing record.',
      security: [{ BearerAuth: [] }],
      parameters: [
        {
          name: 'id',
          in: 'path',
          required: true,
          schema: {
            type: 'string',
            minLength: 1,
          },
        },
      ],
      responses: {
        '200': {
          description: 'Billing deleted',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  message: {
                    type: 'string',
                  },
                },
              },
            },
          },
        },
        '401': {
          description: 'Unauthorized',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ErrorResponse',
              },
            },
          },
        },
        '404': {
          description: 'Billing not found',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ErrorResponse',
              },
            },
          },
        },
        '500': {
          description: 'Internal server error',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ErrorResponse',
              },
            },
          },
        },
      },
    },
  },
  '/billings/soft/{id}': {
    delete: {
      tags: ['Billings'],
      summary: 'Soft delete a billing record',
      description: 'Soft delete (mark as deleted) a billing record.',
      security: [{ BearerAuth: [] }],
      parameters: [
        {
          name: 'id',
          in: 'path',
          required: true,
          schema: {
            type: 'string',
            minLength: 1,
          },
        },
      ],
      responses: {
        '200': {
          description: 'Billing soft deleted',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Billing',
              },
            },
          },
        },
        '401': {
          description: 'Unauthorized',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ErrorResponse',
              },
            },
          },
        },
        '404': {
          description: 'Billing not found',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ErrorResponse',
              },
            },
          },
        },
        '500': {
          description: 'Internal server error',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ErrorResponse',
              },
            },
          },
        },
      },
    },
  },
};
