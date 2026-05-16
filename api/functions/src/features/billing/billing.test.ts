// Test cases for billing (TDD)
/// You must not touch the any of the code here.
/// To create a new test case, create pseudo code in the form of a comment.
/// This could mean what it does, and what it returns.
/// You can also add edge cases and error cases as well.

// Create a new billing
// It should create a new billing with the given details and return the billing ID.
// It should return an error if the property ID is not provided.
// It should return an error if the previous reading ID is not provided.
// It should return an error if the current reading ID is not provided.
// It should return an error if the property ID does not exist.
// It should return an error if the previous reading ID does not exist.
// It should return an error if the current reading ID does not exist.
// It should return an error if the previous reading and current reading do not belong to the same property.

// Get billing by ID
// It should return the billing details for the given billing ID.
// It should return an error if the billing ID is not provided.
// It should return an error if the billing ID does not exist.

// Search billings
// It should return a cursor-based paginated list of all billing based on the provided filters such as property ID.
// It should return an empty list if there are no billing matching everything in the query.

// Update billing
// It should update the billing details for the given billing ID and return the updated billing details.
// It should return an error if the property ID is not provided.
// It should return an error if the property ID does not exist.
// It should return an error if the previous reading ID is not provided.
// It should return an error if the previous reading ID does not exist.
// It should return an error if the current reading ID is not provided.
// It should return an error if the current reading ID does not exist.
// It should return an error if the previous reading and current reading do not belong to the same property.

// Delete billing
// It should delete the billing for the given billing ID and return a success message.
// It should return an error if the billing ID is not provided.
// It should return an error if the billing ID does not exist.

// Soft delete billing
// It should soft delete the billing for the given billing ID and return a success message.
// It should return an error if the billing ID is not provided.
// It should return an error if the billing ID does not exist.