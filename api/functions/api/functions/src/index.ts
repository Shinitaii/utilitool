import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import rateLimit from 'express-rate-limit';
import 'express-async-errors';
import {onRequest} from 'firebase-functions/v2/https';

import {logger} from './config/logger.config';
import {corsConfig} from './config/cors.config';
import {authRateLimiter, apiRateLimiter} from './config/rate-limit.config';
import {errorHandler} from './middlewares/error-handler.middleware';
import {authMiddleware} from './middlewares/auth.middleware';
import {setupSwagger} from './config/swagger.config';

import authRoutes from './features/auth/auth.route';
import meterGroupRoutes from './features/meter-group/meter-group.route';
import propertyRoutes from './features/property/property.route';
import tenantRoutes from './features/tenant/tenant.route';
import readingRoutes from './features/reading/reading.route';
import billingRoutes from './features/billing/billing.route';
import billingCycleRoutes from './features/billing-cycle/billing-cycle.route';

const app = express();

// CORS & Security
app.use(cors(corsConfig));
app.use(helmet());

// Logging
app.use(pinoHttp({logger}));

// Parsing
app.use(express.json());

// Rate limiting (auth routes stricter)
app.use('/auth', authRateLimiter);
app.use(apiRateLimiter);

// Swagger docs (unprotected)
setupSwagger(app);

// Auth routes (no auth required)
app.use('/auth', authRoutes);

// Protected routes (auth required)
app.use(authMiddleware);
app.use('/meter-groups', meterGroupRoutes);
app.use('/properties', propertyRoutes);
app.use('/tenants', tenantRoutes);
app.use('/readings', readingRoutes);
app.use('/billings', billingRoutes);
app.use('/billing-cycles', billingCycleRoutes);

// Error handling
app.use(errorHandler);

// Health check
app.get('/health', (_req, res) => {
  res.json({status: 'ok'});
});

export const api = onRequest(app);
