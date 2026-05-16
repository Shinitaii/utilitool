/// TDD Case for meter group
/// You must not touch the any of the code here.
/// To create a new test case, create pseudo code in the form of a comment.
/// This could mean what it does, and what it returns.
/// You can also add edge cases and error cases as well.

// Create a new meter group
// It should create a new meter group with the given meter name, utility type, and return the meter group ID.
// It should return an error if the meter name is not provided.
// It should return an error if the utility type is not provided.
// It should return an error if the utility type is not valid.
// It should return an error if the meter name already exists for the selected utility type.

// Get meter group by ID
// It should return the meter group details for the given meter group ID.
// It should return an error if the meter group ID is not provided.
// It should return an error if the meter group ID does not exist.

// Search meter groups
// It should return a cursor-based paginated list of all meter groups based on the provided filters such as name, utility type, and active status.
// It should return an empty list if there are no meter groups matching everything in the query.

// Update meter group
// It should update the meter group details for the given meter group ID and return the updated meter group details.
// It should return an error if the meter group ID is not provided.
// It should return an error if the meter group ID does not exist.
// It should return an error if the updated utility type is not valid.

// Delete meter group
// It should delete the meter group for the given meter group ID and return a success message.
// It should return an error if the meter group ID is not provided.
// It should return an error if the meter group ID does not exist.

// Soft delete meter group
// It should soft delete the meter group for the given meter group ID and return a success message.
// It should return an error if the meter group ID is not provided.
// It should return an error if the meter group ID does not exist.