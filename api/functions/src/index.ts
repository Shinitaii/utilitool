import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import 'express-async-errors';
import {onRequest} from 'firebase-functions/v2/https';
import {Timestamp} from 'firebase-admin/firestore';

import {corsOptions} from './config/cors.config';
import {authRateLimiter, apiRateLimiter} from './config/rate-limit.config';
import {errorHandler} from './middlewares/error-handler.middleware';
import {authMiddleware} from './middlewares/auth.middleware';
import {requestLogger} from './middlewares/request-logger.middleware';
import {setupSwagger} from './config/swagger.config';
import {logger} from './utils/logger.util';

import authRoutes from './features/auth/auth.route';
import meterGroupRoutes from './features/meter-group/meter-group.route';
import propertyRoutes from './features/property/property.route';
import tenantRoutes from './features/tenant/tenant.route';
import readingRoutes from './features/reading/reading.route';
import billingRoutes from './features/billing/billing.route';
import billingCycleRoutes from './features/billing-cycle/billing-cycle.route';
import billsRoutes from './features/bills/bills.route';
import userRoutes from './features/user/user.route';

const app = express();

// Trust proxy for rate limiting behind Firebase CDN
app.set('trust proxy', 1);

// JSON serializer: convert Firestore Timestamps to ISO strings and filter internal fields
app.set('json replacer', (key: string, value: any) => {
  // Strip internal soft-delete fields from responses
  if (key === 'is_deleted' || key === 'deleted_at') {
    return undefined;
  }
  // Convert Firestore Timestamps to ISO strings
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  return value;
});

// CORS & Security
app.use(cors(corsOptions));
app.use(helmet());

// Logging
app.use(requestLogger);

// Parsing
app.use(express.json());

// Rate limiting (auth routes stricter)
app.use('/auth', authRateLimiter);
app.use(apiRateLimiter);

// Swagger docs (unprotected)
setupSwagger(app);

// Auth routes (no auth required)
app.use('/auth', authRoutes);

// Health check (unprotected)
app.get('/health', (_req, res) => {
  res.json({status: 'ok'});
});

// Protected routes (auth required)
app.use(authMiddleware);

// OCR routes: allow larger payloads (base64 images)
app.use('/readings/ocr', express.json({limit: '1mb'}));
app.use('/billing-cycles/ocr', express.json({limit: '1mb'}));

app.use('/meter-groups', meterGroupRoutes);
app.use('/properties', propertyRoutes);
app.use('/tenants', tenantRoutes);
app.use('/readings', readingRoutes);
app.use('/billings', billingRoutes);
app.use('/billing-cycles', billingCycleRoutes);
app.use('/bills', billsRoutes);
app.use('/users', userRoutes);

// Error handling
app.use(errorHandler);

export const api = onRequest(app);

// Local development server
if (process.env.NODE_ENV === 'development') {
  const PORT = process.env.PORT || 5002;
  try {
    app.listen(PORT, () => {
      logger.info(`API server running on port ${PORT}`);
    });
  } catch (error) {
    logger.error({error}, 'Failed to start server');
    process.exit(1);
  }

  process.on('uncaughtException', (error) => {
    logger.error({error}, 'Uncaught exception');
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error({reason, promise}, 'Unhandled rejection');
    process.exit(1);
  });
}
