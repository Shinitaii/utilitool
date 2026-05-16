/// TDD Case for property
/// You must not touch the any of the code here.
/// To create a new test case, create pseudo code in the form of a comment.
/// This could mean what it does, and what it returns.
/// You can also add edge cases and error cases as well.

// Create a new property
// It should create a new property with the given room name, tenant amount, and meter group ID, and return the property ID.
// It should return an error if the room name is not provided.
// It should return an error if the tenant amount is not provided.
// It should return an error if the meter group ID is not provided.
// It should return an error if the selected meter group does not exist.
// It should return an error if the room name already exists for the selected meter group.

// Get property by ID
// It should return the property details for the given property ID.
// It should return an error if the property ID is not provided.
// It should return an error if the property ID does not exist.

// Search properties
// It should return a cursor-based paginated list of all properties based on the provided filters such as room name and meter group ID.
// It should return an empty list if there are no properties matching everything in the query.

// Update property
// It should update the property details for the given property ID and return the updated property details.
// It should return an error if the property ID is not provided.
// It should return an error if the property ID does not exist.
// It should return an error if the updated meter group ID does not exist.
// It should return an error if the updated tenant amount is not a positive integer.
// It should return an error if the updated tenant amount is less than the current tenant amount for the property.
// It should return an error if the updated room name already exists for the selected meter group.

// Delete property
// It should delete the property for the given property ID and return a success message.
// It should return an error if the property ID is not provided.
// It should return an error if the property ID does not exist.

// Soft delete property
// It should soft delete the property for the given property ID and return a success message.
// It should return an error if the property ID is not provided.
// It should return an error if the property ID does not exist.