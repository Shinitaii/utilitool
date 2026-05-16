import { describe, it, expect } from '@jest/globals';

/// Test cases for tenant (TDD)
/// You must not touch the any of the code here.
/// To create a new test case, create pseudo code in the form of a comment.
/// This could mean what it does, and what it returns.
/// You can also add edge cases and error cases as well.

// Create a new tenant
// It should create a new tenant with the given name and return the tenant ID.
// It should return an error if the tenant name is not provided.
// It should return an error if the selected property is not provided.
// It should return an error if the selected property does not exist.
// It should return an error if the tenant name already exists for the selected property.
// It should return an error if the selected property already has the maximum number of tenants allowed.

// Get tenant by ID
// It should return the tenant details for the given tenant ID.
// It should return an error if the tenant ID is not provided.
// It should return an error if the tenant ID does not exist.

// Search tenants
// It should return a cursor-based paginated list of all tenants based on the provided filters such as name and property ID.
// It should return an empty list if there are no tenants matching everything in the query.

// Update tenant
// It should update the tenant details for the given tenant ID and return the updated tenant details.
// It should return an error if the tenant ID is not provided.
// It should return an error if the tenant ID does not exist.
// It should return an error if the updated property ID does not exist.
// It should return an error if the updated tenant name already exists for the selected property.

// Delete tenant
// It should delete the tenant for the given tenant ID and return a success message.
// It should return an error if the tenant ID is not provided.
// It should return an error if the tenant ID does not exist.

// Soft delete tenant
// It should soft delete the tenant for the given tenant ID and return a success message.
// It should return an error if the tenant ID is not provided.
// It should return an error if the tenant ID does not exist.
