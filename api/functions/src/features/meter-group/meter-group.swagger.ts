export const meterGroupPaths = {
  '/meter-groups': {
    post: {
      tags: ['Meter Groups'],
      summary: 'Create a new meter group',
      description:
        'Create a single meter group. Meter name must be unique per utility type.',
      security: [{ BearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/CreateMeterGroupRequest',
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Meter group created',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/MeterGroup',
              },
            },
          },
        },
        '400': {
          description: 'Validation error (invalid input)',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ValidationErrorResponse',
              },
            },
          },
        },
        '401': {
          description: 'Unauthorized (missing or invalid token)',
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
            'Conflict (meter name already exists for this utility type)',
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
      tags: ['Meter Groups'],
      summary: 'List meter groups',
      description:
        'Retrieve paginated list of meter groups. Can filter by meter name or utility type. Note: cursor and meterName filters are mutually exclusive.',
      security: [{ BearerAuth: [] }],
      parameters: [
        {
          name: 'meterName',
          in: 'query',
          description: 'Filter by meter name (case-insensitive partial match)',
          schema: {
            type: 'string',
            minLength: 1,
            maxLength: 255,
          },
        },
        {
          name: 'utilityType',
          in: 'query',
          description: 'Filter by utility type',
          schema: {
            type: 'string',
            enum: ['electricity', 'water'],
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
            'Pagination cursor from previous response. Cannot be combined with meterName.',
          schema: {
            type: 'string',
          },
        },
      ],
      responses: {
        '200': {
          description: 'List of meter groups',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/PaginatedMeterGroups',
              },
            },
          },
        },
        '400': {
          description: 'Validation error (invalid query params)',
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
  '/meter-groups/batch': {
    post: {
      tags: ['Meter Groups'],
      summary: 'Create multiple meter groups',
      description:
        'Batch create 1-10 meter groups. Each meter name must be unique per utility type.',
      security: [{ BearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/CreateMeterGroupRequest',
              },
              minItems: 1,
              maxItems: 10,
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Meter groups created',
          content: {
            'application/json': {
              schema: {
                type: 'array',
                items: {
                  $ref: '#/components/schemas/MeterGroup',
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
        '409': {
          description: 'Conflict (duplicate meter name)',
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
      tags: ['Meter Groups'],
      summary: 'Update multiple meter groups',
      description: 'Batch update 1-10 meter groups.',
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
                    $ref: '#/components/schemas/UpdateMeterGroupRequest',
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
          description: 'Meter groups updated',
          content: {
            'application/json': {
              schema: {
                type: 'array',
                items: {
                  $ref: '#/components/schemas/MeterGroup',
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
          description: 'One or more meter groups not found',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ErrorResponse',
              },
            },
          },
        },
        '409': {
          description: 'Conflict (duplicate meter name)',
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
  '/meter-groups/{id}': {
    get: {
      tags: ['Meter Groups'],
      summary: 'Get meter group by ID',
      description: 'Retrieve a single meter group by ID.',
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
          description: 'Meter group retrieved',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/MeterGroup',
              },
            },
          },
        },
        '400': {
          description: 'Validation error (invalid ID)',
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
      tags: ['Meter Groups'],
      summary: 'Update a meter group',
      description: 'Update a single meter group (all fields optional).',
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
              $ref: '#/components/schemas/UpdateMeterGroupRequest',
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Meter group updated',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/MeterGroup',
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
          description: 'Conflict (meter name already exists)',
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
      tags: ['Meter Groups'],
      summary: 'Delete a meter group (hard delete)',
      description: 'Permanently delete a meter group.',
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
          description: 'Meter group deleted',
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
  },
  '/meter-groups/{id}/reset': {
    post: {
      tags: ['Meter Groups'],
      summary: 'Record a meter reset',
      description: 'Increments current_version and records the last reading as the version\'s closing value. Requires admin or landlord role.',
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
          description: 'Meter reset recorded',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/MeterGroup',
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
        '403': {
          description: 'Forbidden (requires admin or landlord role)',
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
        '422': {
          description: 'No readings found for this meter group',
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
  '/meter-groups/soft/{id}': {
    delete: {
      tags: ['Meter Groups'],
      summary: 'Soft delete a meter group',
      description: 'Soft delete (mark as deleted) a meter group.',
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
          description: 'Meter group soft deleted',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/MeterGroup',
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
  },
};
