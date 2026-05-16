/// Test cases for reading (TDD)
/// You must not touch the any of the code here.
/// To create a new test case, create pseudo code in the form of a comment.
/// This could mean what it does, and what it returns.
/// You can also add edge cases and error cases as well.

// Create a new reading
// It should create a new reading with the given name and return the reading ID.
// It should return an error if the selected meter group is not provided.
// It should return an error if the selected meter group does not exist.
// It should return an error if the reading value is not a valid number.
// It should return an error if the reading value is negative.
// It should return an error if the reading date is not a valid date.
// It should return an error if the reading date is in the future.
// It should return an error if the selected meter group already has the maximum number of readings allowed.

// Get reading by ID
// It should return the reading details for the given reading ID.
// It should return an error if the reading ID is not provided.
// It should return an error if the reading ID does not exist.

// Search readings
// It should return a cursor-based paginated list of all readings based on the provided filters such as name and property ID.
// It should return an empty list if there are no readings matching everything in the query.

// Update reading
// It should update the reading details for the given reading ID and return the updated reading details.
// It should return an error if the reading ID is not provided.
// It should return an error if the reading ID does not exist.
// It should return an error if the updated meter group ID does not exist.
// It should return an error if the updated reading value is not a valid number.
// It should return an error if the updated reading value is negative.
// It should return an error if the updated reading date is not a valid date.
// It should return an error if the updated reading date is in the future.

// Delete reading
// It should delete the reading for the given reading ID and return a success message.
// It should return an error if the reading ID is not provided.
// It should return an error if the reading ID does not exist.

// Soft delete reading
// It should soft delete the reading for the given reading ID and return a success message.
// It should return an error if the reading ID is not provided.
// It should return an error if the reading ID does not exist.
