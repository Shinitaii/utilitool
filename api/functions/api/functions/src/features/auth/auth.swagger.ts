import { PathsObject } from 'swagger-ui-express';

export const authPaths: PathsObject = {
  '/auth/register': {
    post: {
      tags: ['Auth'],
      summary: 'Register a new user',
      description: 'Create a new user account with email and password.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/RegisterRequest',
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'User registered successfully',
          content: {
            'application/json': {
              schema: {
                allOf: [
                  {
                    $ref: '#/components/schemas/AuthResponse',
                  },
                  {
                    type: 'object',
                    properties: {
                      refresh_token: {
                        type: 'string',
                      },
                    },
                  },
                ],
              },
            },
          },
        },
        '400': {
          description:
            'Validation error (invalid email format, password too short)',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ValidationErrorResponse',
              },
            },
          },
        },
        '409': {
          description: 'Email already registered',
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
  '/auth/login': {
    post: {
      tags: ['Auth'],
      summary: 'Login user',
      description: 'Authenticate with email and password, receive JWT tokens.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/LoginRequest',
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Login successful',
          content: {
            'application/json': {
              schema: {
                allOf: [
                  {
                    $ref: '#/components/schemas/AuthResponse',
                  },
                  {
                    type: 'object',
                    properties: {
                      refresh_token: {
                        type: 'string',
                      },
                    },
                  },
                ],
              },
            },
          },
        },
        '400': {
          description: 'Validation error (missing fields, invalid format)',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ValidationErrorResponse',
              },
            },
          },
        },
        '401': {
          description: 'Invalid credentials (email or password incorrect)',
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
  '/auth/refresh': {
    post: {
      tags: ['Auth'],
      summary: 'Refresh access token',
      description: 'Use refresh token to obtain a new access token.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/RefreshRequest',
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Token refreshed successfully',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/AuthResponse',
              },
            },
          },
        },
        '400': {
          description: 'Validation error (missing refresh token)',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ValidationErrorResponse',
              },
            },
          },
        },
        '401': {
          description: 'Invalid or expired refresh token',
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
  '/auth/logout': {
    post: {
      tags: ['Auth'],
      summary: 'Logout user',
      description: 'Invalidate the refresh token.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                refreshTokenId: {
                  type: 'string',
                },
              },
              required: ['refreshTokenId'],
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Logout successful',
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
