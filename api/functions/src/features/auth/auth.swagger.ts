export const authPaths = {
  '/auth/me': {
    get: {
      tags: ['Auth'],
      summary: 'Get current user profile',
      description: 'Retrieve the authenticated user\'s profile information.',
      security: [{ BearerAuth: [] }],
      responses: {
        '200': {
          description: 'User profile retrieved successfully',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/UserProfile',
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
    patch: {
      tags: ['Auth'],
      summary: 'Update current user profile',
      description: 'Update the authenticated user\'s profile information.',
      security: [{ BearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/UpdateUserProfile',
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'User profile updated successfully',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/UserProfile',
              },
            },
          },
        },
        '400': {
          description: 'Invalid request body',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ErrorResponse',
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
