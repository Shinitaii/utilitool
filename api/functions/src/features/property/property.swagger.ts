export const propertyPaths = {
  '/properties': {
    post: {
      tags: ['Properties'],
      summary: 'Create a new property',
      description:
        'Create a single property. Room name must be unique within the meter group.',
      security: [{ BearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/CreatePropertyRequest',
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Property created',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Property',
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
        '409': {
          description: 'Conflict (room name already exists in meter group)',
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
      tags: ['Properties'],
      summary: 'List properties',
      description:
        'Retrieve paginated list of properties. Can filter by room name or meter group ID.',
      security: [{ BearerAuth: [] }],
      parameters: [
        {
          name: 'roomName',
          in: 'query',
          description: 'Filter by room name (case-insensitive partial match)',
          schema: {
            type: 'string',
            minLength: 1,
            maxLength: 255,
          },
        },
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
          description: 'Pagination cursor from previous response',
          schema: {
            type: 'string',
          },
        },
      ],
      responses: {
        '200': {
          description: 'List of properties',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/PaginatedProperties',
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
  '/properties/batch': {
    post: {
      tags: ['Properties'],
      summary: 'Create multiple properties',
      description: 'Batch create 1-10 properties.',
      security: [{ BearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/CreatePropertyRequest',
              },
              minItems: 1,
              maxItems: 10,
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Properties created',
          content: {
            'application/json': {
              schema: {
                type: 'array',
                items: {
                  $ref: '#/components/schemas/Property',
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
        '409': {
          description: 'Conflict (duplicate room name)',
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
      tags: ['Properties'],
      summary: 'Update multiple properties',
      description: 'Batch update 1-10 properties.',
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
                    $ref: '#/components/schemas/UpdatePropertyRequest',
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
          description: 'Properties updated',
          content: {
            'application/json': {
              schema: {
                type: 'array',
                items: {
                  $ref: '#/components/schemas/Property',
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
          description: 'Property or meter group not found',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ErrorResponse',
              },
            },
          },
        },
        '409': {
          description: 'Conflict (duplicate room name or tenant capacity)',
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
  '/properties/{id}': {
    get: {
      tags: ['Properties'],
      summary: 'Get property by ID',
      description: 'Retrieve a single property by ID.',
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
          description: 'Property retrieved',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Property',
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
          description: 'Property not found',
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
      tags: ['Properties'],
      summary: 'Update a property',
      description:
        'Update a single property. Tenant amount cannot be reduced below current tenant count.',
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
              $ref: '#/components/schemas/UpdatePropertyRequest',
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Property updated',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Property',
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
          description: 'Property or meter group not found',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ErrorResponse',
              },
            },
          },
        },
        '409': {
          description:
            'Conflict (room name already exists or tenant capacity too low)',
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
      tags: ['Properties'],
      summary: 'Delete a property (hard delete)',
      description: 'Permanently delete a property.',
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
          description: 'Property deleted',
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
          description: 'Property not found',
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
  '/properties/soft/{id}': {
    delete: {
      tags: ['Properties'],
      summary: 'Soft delete a property',
      description: 'Soft delete (mark as deleted) a property.',
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
          description: 'Property soft deleted',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Property',
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
          description: 'Property not found',
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
