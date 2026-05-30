export const tenantPaths = {
  "/tenants": {
    post: {
      tags: ["Tenants"],
      summary: "Create a new tenant",
      description:
        "Create a single tenant. Tenant name must be unique within the property. Property must not exceed its tenant capacity.",
      security: [{BearerAuth: []}],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/CreateTenantRequest",
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Tenant created",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/Tenant",
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
          description: "Property not found",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ErrorResponse",
              },
            },
          },
        },
        "409": {
          description:
            "Conflict (tenant name already exists in property or property tenant capacity exceeded)",
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
      tags: ["Tenants"],
      summary: "List tenants",
      description:
        "Retrieve paginated list of tenants. Can filter by tenant name or property ID.",
      security: [{BearerAuth: []}],
      parameters: [
        {
          name: "tenantName",
          in: "query",
          description: "Filter by tenant name (case-insensitive partial match)",
          schema: {
            type: "string",
            minLength: 1,
            maxLength: 255,
          },
        },
        {
          name: "propertyId",
          in: "query",
          description: "Filter by property ID",
          schema: {
            type: "string",
            minLength: 1,
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
          description: "Pagination cursor from previous response",
          schema: {
            type: "string",
          },
        },
      ],
      responses: {
        "200": {
          description: "List of tenants",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/PaginatedTenants",
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
  "/tenants/batch": {
    post: {
      tags: ["Tenants"],
      summary: "Create multiple tenants",
      description: "Batch create 1-10 tenants.",
      security: [{BearerAuth: []}],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "array",
              items: {
                $ref: "#/components/schemas/CreateTenantRequest",
              },
              minItems: 1,
              maxItems: 10,
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Tenants created",
          content: {
            "application/json": {
              schema: {
                type: "array",
                items: {
                  $ref: "#/components/schemas/Tenant",
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
          description: "Property not found",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ErrorResponse",
              },
            },
          },
        },
        "409": {
          description:
            "Conflict (duplicate tenant name or property capacity exceeded)",
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
      tags: ["Tenants"],
      summary: "Update multiple tenants",
      description: "Batch update 1-10 tenants.",
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
                    $ref: "#/components/schemas/UpdateTenantRequest",
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
          description: "Tenants updated",
          content: {
            "application/json": {
              schema: {
                type: "array",
                items: {
                  $ref: "#/components/schemas/Tenant",
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
          description: "Tenant or property not found",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ErrorResponse",
              },
            },
          },
        },
        "409": {
          description:
            "Conflict (duplicate tenant name or property capacity exceeded)",
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
  "/tenants/{id}": {
    get: {
      tags: ["Tenants"],
      summary: "Get tenant by ID",
      description: "Retrieve a single tenant by ID.",
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
          description: "Tenant retrieved",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/Tenant",
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
          description: "Tenant not found",
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
      tags: ["Tenants"],
      summary: "Update a tenant",
      description: "Update a single tenant.",
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
              $ref: "#/components/schemas/UpdateTenantRequest",
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Tenant updated",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/Tenant",
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
          description: "Tenant or property not found",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ErrorResponse",
              },
            },
          },
        },
        "409": {
          description:
            "Conflict (tenant name already exists or property capacity exceeded)",
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
      tags: ["Tenants"],
      summary: "Delete a tenant (hard delete)",
      description: "Permanently delete a tenant.",
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
          description: "Tenant deleted",
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
          description: "Tenant not found",
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
  "/tenants/soft/{id}": {
    delete: {
      tags: ["Tenants"],
      summary: "Soft delete a tenant",
      description: "Soft delete (mark as deleted) a tenant.",
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
          description: "Tenant soft deleted",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/Tenant",
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
          description: "Tenant not found",
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
