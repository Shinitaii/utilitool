jest.mock('firebase-admin', () => ({
  auth: jest.fn().mockReturnValue({
    verifyIdToken: jest.fn(),
  }),
  firestore: jest.fn().mockReturnValue({
    settings: jest.fn(),
    collection: jest.fn(),
  }),
  app: jest.fn().mockReturnValue({}),
  database: jest.fn().mockReturnValue({}),
  apps: ['mock-app'],
}));
jest.mock('../config/firebase.config', () => ({
  firestore: {
    collection: jest.fn(),
    settings: jest.fn(),
  },
  firebaseApp: {},
}));

import { describe, it, expect } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { json } from 'express';
import 'express-async-errors';
import { authMiddleware } from './auth.middleware';
import { errorHandler } from './error-handler.middleware';

import { meterGroupRouter } from '../features/meter-group/meter-group.route';
import { propertyRouter } from '../features/property/property.route';
import { tenantRouter } from '../features/tenant/tenant.route';
import { readingRouter } from '../features/reading/reading.route';
import { billingRouter } from '../features/billing/billing.route';
import { billingCycleRouter } from '../features/billing-cycle/billing-cycle.route';
import { billsRouter } from '../features/bills/bills.route';
import { userRouter } from '../features/user/user.route';
import { imageExtractionRouter } from '../features/image-extraction/image-extraction.route';
import { reportsRouter } from '../features/reports/reports.route';

// Mirrors the protected-route mount order in src/index.ts (everything after
// `app.use(authMiddleware)`), so this sweep proves authMiddleware actually gates
// every feature router — not just the one under test in each feature's own suite.
const app = express();
app.use(json());
app.use(authMiddleware);
app.use('/meter-groups', meterGroupRouter);
app.use('/properties', propertyRouter);
app.use('/tenants', tenantRouter);
app.use('/readings', readingRouter);
app.use('/billings', billingRouter);
app.use('/billing-cycles', billingCycleRouter);
app.use('/bills', billsRouter);
app.use('/users', userRouter);
app.use('/image-extraction', imageExtractionRouter);
app.use('/reports', reportsRouter);
app.use(errorHandler);

describe('authMiddleware sweep: every protected route rejects unauthenticated requests', () => {
  const protectedGetRoutes = [
    '/meter-groups',
    '/meter-groups/some-id',
    '/properties',
    '/properties/some-id',
    '/tenants',
    '/tenants/some-id',
    '/readings',
    '/readings/some-id',
    '/billings',
    '/billings/some-id',
    '/billing-cycles',
    '/billing-cycles/some-id',
    '/users/some-id',
    '/reports/summary',
    '/reports/consumption',
    '/reports/billing-trends',
    '/reports/collection-status',
  ];

  it.each(protectedGetRoutes)('GET %s returns 401 with no Authorization header', async (route) => {
    const res = await request(app).get(route);
    expect(res.status).toBe(401);
  });

  it.each(protectedGetRoutes)('GET %s returns 401 with a malformed Authorization header', async (route) => {
    const res = await request(app).get(route).set('Authorization', 'not-a-bearer-token');
    expect(res.status).toBe(401);
  });

  const protectedPostRoutes = [
    '/meter-groups',
    '/properties',
    '/tenants',
    '/readings',
    '/billings',
    '/billing-cycles',
    '/bills/ocr',
    '/image-extraction/readings',
    '/image-extraction/billings',
  ];

  it.each(protectedPostRoutes)('POST %s returns 401 with no Authorization header', async (route) => {
    const res = await request(app).post(route).send({});
    expect(res.status).toBe(401);
  });
});
