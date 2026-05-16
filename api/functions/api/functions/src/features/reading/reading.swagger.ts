import { PathsObject } from 'swagger-ui-express';

export const readingPaths: PathsObject = {
  '/readings': {
    post: {
      tags: ['Readings'],
      summary: 'Create a new meter reading',
      description:
        'Create a single meter reading. Reading amount must be non-negative, reading date must not be in the future, and meter group must exist.',
      security: [{ BearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/CreateReadingRequest',
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Reading created',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Reading',
              },
            },
          },
        },
        '400': {
          description:
            'Validation error (negative amount, future date, reading limit exceeded)',
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
          description: 'Meter group not found',
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
      tags: ['Readings'],
      summary: 'List meter readings',
      description:
        'Retrieve paginated list of readings. Can filter by meter group ID. Note: cursor and meterGroupId filters are mutually exclusive.',
      security: [{ BearerAuth: [] }],
      parameters: [
        {
          name: 'meterGroupId',
          in: 'query',
          description: 'Filter by meter group ID',
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
            'Pagination cursor from previous response. Cannot be combined with meterGroupId.',
          schema: {
            type: 'string',
          },
        },
      ],
      responses: {
        '200': {
          description: 'List of readings',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/PaginatedReadings',
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
  '/readings/batch': {
    post: {
      tags: ['Readings'],
      summary: 'Create multiple meter readings',
      description: 'Batch create 1-10 meter readings.',
      security: [{ BearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/CreateReadingRequest',
              },
              minItems: 1,
              maxItems: 10,
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Readings created',
          content: {
            'application/json': {
              schema: {
                type: 'array',
                items: {
                  $ref: '#/components/schemas/Reading',
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
          description: 'Meter group not found',
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
      tags: ['Readings'],
      summary: 'Update multiple meter readings',
      description: 'Batch update 1-10 meter readings.',
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
                    $ref: '#/components/schemas/UpdateReadingRequest',
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
          description: 'Readings updated',
          content: {
            'application/json': {
              schema: {
                type: 'array',
                items: {
                  $ref: '#/components/schemas/Reading',
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
          description: 'Reading or meter group not found',
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
  '/readings/{id}': {
    get: {
      tags: ['Readings'],
      summary: 'Get reading by ID',
      description: 'Retrieve a single meter reading by ID.',
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
          description: 'Reading retrieved',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Reading',
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
          description: 'Reading not found',
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
      tags: ['Readings'],
      summary: 'Update a meter reading',
      description: 'Update a single meter reading.',
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
              $ref: '#/components/schemas/UpdateReadingRequest',
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Reading updated',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Reading',
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
          description: 'Reading or meter group not found',
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
      tags: ['Readings'],
      summary: 'Delete a reading (hard delete)',
      description: 'Permanently delete a meter reading.',
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
          description: 'Reading deleted',
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
          description: 'Reading not found',
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
  '/readings/soft/{id}': {
    delete: {
      tags: ['Readings'],
      summary: 'Soft delete a reading',
      description: 'Soft delete (mark as deleted) a meter reading.',
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
          description: 'Reading soft deleted',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Reading',
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
          description: 'Reading not found',
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
