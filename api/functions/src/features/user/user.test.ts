jest.mock('firebase-admin', () => ({
  auth: jest.fn().mockReturnValue({
    verifyIdToken: jest.fn(),
    createUser: jest.fn(),
  }),
  firestore: jest.fn().mockReturnValue({
    settings: jest.fn(),
    collection: jest.fn(),
  }),
  app: jest.fn().mockReturnValue({}),
  database: jest.fn().mockReturnValue({}),
  apps: ['mock-app'],
}));
jest.mock('../../config/firebase.config', () => ({
  firestore: {
    collection: jest.fn(),
    settings: jest.fn(),
  },
  firebaseApp: {},
}));
jest.mock('../auth/auth.repository');
jest.mock('../../lib/firestore.lib', () => ({
  setDocument: jest.fn(),
}));

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { json } from 'express';
import 'express-async-errors';
import { userRouter } from './user.route';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { userRepository } from '../auth/auth.repository';
import { setDocument } from '../../lib/firestore.lib';
import { errorHandler } from '../../middlewares/error-handler.middleware';
import * as admin from 'firebase-admin';

// Build a minimal Express app for testing
const app = express();
app.use(json());
app.use(authMiddleware);
app.use('/users', userRouter);
app.use(errorHandler);

const mockAdminUser = {
  id: 'admin-uid',
  email: 'admin@test.com',
  display_name: 'Admin',
  role: 'admin' as const,
  is_deleted: false,
  created_at: new Date(),
  updated_at: new Date(),
};

describe('POST /users', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create the Firebase Auth account server-side and the profile with the specified role', async () => {
    const newUid = 'new-meter-reader-1';
    jest.mocked(admin.auth().verifyIdToken).mockResolvedValue({ uid: 'admin-uid' } as any);
    jest.mocked(admin.auth().createUser).mockResolvedValue({ uid: newUid } as any);
    // Keyed on id (not call order) — the requireRole role-cache is a module-level
    // singleton that persists across tests, so it may skip calling getById for
    // 'admin-uid' on later tests, leaving mockResolvedValueOnce queues misaligned.
    jest.mocked(userRepository.getById).mockImplementation(async (id: string) => {
      if (id === 'admin-uid') return mockAdminUser as any; // requireRole: fetch caller's role
      return null; // createUser: target does not exist yet
    });
    jest.mocked(setDocument).mockResolvedValue({
      id: newUid,
      email: '',
      display_name: '',
      role: 'assistant',
      is_deleted: false,
      created_at: new Date(),
      updated_at: new Date(),
    } as any);

    const response = await request(app)
      .post('/users')
      .set('Authorization', 'Bearer valid-token')
      .send({ email: 'newuser@test.com', password: 'password123', role: 'assistant' });

    expect(response.status).toBe(201);
    expect(admin.auth().createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'newuser@test.com', password: 'password123' })
    );
    expect(setDocument).toHaveBeenCalledWith(
      expect.any(String),
      newUid,
      expect.objectContaining({ role: 'assistant' })
    );
    expect(response.body.id).toBe(newUid);
    expect(response.body.role).toBe('assistant');
  });

  it('should return 409 if the email already has a Firebase Auth account', async () => {
    jest.mocked(admin.auth().verifyIdToken).mockResolvedValue({ uid: 'admin-uid' } as any);
    jest.mocked(userRepository.getById).mockResolvedValue(mockAdminUser as any);
    jest.mocked(admin.auth().createUser).mockRejectedValue({ code: 'auth/email-already-exists' });

    const response = await request(app)
      .post('/users')
      .set('Authorization', 'Bearer valid-token')
      .send({ email: 'existing@test.com', password: 'password123', role: 'landlord' });

    expect(response.status).toBe(409);
  });

  it('should return 400 if role is invalid', async () => {
    jest.mocked(admin.auth().verifyIdToken).mockResolvedValue({ uid: 'admin-uid' } as any);
    jest.mocked(userRepository.getById).mockResolvedValue(mockAdminUser as any);

    const response = await request(app)
      .post('/users')
      .set('Authorization', 'Bearer valid-token')
      .send({ email: 'newuser@test.com', password: 'password123', role: 'invalid-role' });

    expect(response.status).toBe(400);
    expect(admin.auth().createUser).not.toHaveBeenCalled();
  });

  it('should return 400 if password is too short', async () => {
    jest.mocked(admin.auth().verifyIdToken).mockResolvedValue({ uid: 'admin-uid' } as any);
    jest.mocked(userRepository.getById).mockResolvedValue(mockAdminUser as any);

    const response = await request(app)
      .post('/users')
      .set('Authorization', 'Bearer valid-token')
      .send({ email: 'newuser@test.com', password: 'short', role: 'assistant' });

    expect(response.status).toBe(400);
    expect(admin.auth().createUser).not.toHaveBeenCalled();
  });

  it('should return 403 if non-admin tries to create user', async () => {
    jest.mocked(admin.auth().verifyIdToken).mockResolvedValue({ uid: 'assistant-uid' } as any);
    jest.mocked(userRepository.getById).mockResolvedValue({
      ...mockAdminUser,
      id: 'assistant-uid',
      role: 'assistant' as const,
    });

    const response = await request(app)
      .post('/users')
      .set('Authorization', 'Bearer valid-token')
      .send({ email: 'newuser@test.com', password: 'password123', role: 'assistant' });

    expect(response.status).toBe(403);
    expect(admin.auth().createUser).not.toHaveBeenCalled();
  });
});
