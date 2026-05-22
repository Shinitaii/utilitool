/**
 * POST /users — Create/assign user role (admin only)
 *
 * Happy path:
 * - Admin creates new user with role=assistant → 201
 * - New user profile appears in Firestore with that role
 *
 * Error cases:
 * - User already exists → 409
 * - Invalid role → 400
 * - Non-admin tries to create user → 403
 * - Missing uid → 400
 */

describe('POST /users', () => {
  it('should create a user with the specified role', async () => {
    // GIVEN an admin user and a new uid
    const adminToken = 'valid-admin-token';
    const newUid = 'new-meter-reader-' + Date.now();

    // WHEN the admin calls POST /users
    const response = await fetch('http://localhost:5002/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ uid: newUid, role: 'assistant' })
    });

    // THEN the response is 201 and the user profile is created
    expect(response.status).toBe(201);
    const user = await response.json();
    expect(user.id).toBe(newUid);
    expect(user.role).toBe('assistant');
  });

  it('should return 409 if user profile already exists', async () => {
    // GIVEN an admin and an existing user
    const adminToken = 'valid-admin-token';
    const existingUid = 'existing-user-id';

    // WHEN the admin tries to create the user again
    const response = await fetch('http://localhost:5002/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ uid: existingUid, role: 'landlord' })
    });

    // THEN the response is 409
    expect(response.status).toBe(409);
  });

  it('should return 400 if role is invalid', async () => {
    const adminToken = 'valid-admin-token';
    const newUid = 'test-uid-' + Date.now();

    const response = await fetch('http://localhost:5002/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ uid: newUid, role: 'invalid-role' })
    });

    expect(response.status).toBe(400);
  });

  it('should return 403 if non-admin tries to create user', async () => {
    const assistantToken = 'valid-assistant-token';
    const newUid = 'test-uid-' + Date.now();

    const response = await fetch('http://localhost:5002/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${assistantToken}`
      },
      body: JSON.stringify({ uid: newUid, role: 'assistant' })
    });

    expect(response.status).toBe(403);
  });
});
