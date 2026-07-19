import express from "express";
import cors from "cors";
import helmet from "helmet";
import "express-async-errors";
import {onRequest} from "firebase-functions/v2/https";
import {Timestamp} from "firebase-admin/firestore";

import {corsOptions} from "./config/cors.config";
import {authRateLimiter, apiRateLimiter} from "./config/rate-limit.config";
import {errorHandler} from "./middlewares/error-handler.middleware";
import {authMiddleware} from "./middlewares/auth.middleware";
import {requestContextMiddleware} from "./middlewares/request-context.middleware";
import {requestLogger} from "./middlewares/request-logger.middleware";
import {setupSwagger} from "./config/swagger.config";
import {APP_ENV} from "./config/env.config";
import {logger} from "./utils/logger.util";

import {authRouter} from "./features/auth/auth.route";
import {meterGroupRouter} from "./features/meter-group/meter-group.route";
import {propertyRouter} from "./features/property/property.route";
import {tenantRouter} from "./features/tenant/tenant.route";
import {readingRouter} from "./features/reading/reading.route";
import {billingRouter} from "./features/billing/billing.route";
import {billingCycleRouter} from "./features/billing-cycle/billing-cycle.route";
import {billsRouter} from "./features/bills/bills.route";
import {userRouter} from "./features/user/user.route";
import {imageExtractionRouter} from "./features/image-extraction/image-extraction.route";
import {reportsRouter} from "./features/reports/reports.route";
import {llmConfigRouter} from "./features/llm-config/llm-config.route";
import {chatbotRouter} from "./features/chatbot/chatbot.route";

const app = express();

// Trust proxy for rate limiting behind Firebase CDN
app.set("trust proxy", 1);

// JSON serializer: convert Firestore Timestamps to ISO strings and filter internal fields
app.set("json replacer", (key: string, value: any) => {
  // Strip internal soft-delete fields from responses
  if (key === "is_deleted" || key === "deleted_at") {
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

// Request context (initialize early for all middleware to access)
app.use(requestContextMiddleware);

// Logging
app.use(requestLogger);

// Parsing
app.use(express.json());

// Rate limiting (auth routes stricter)
app.use("/auth", authRateLimiter);
app.use(apiRateLimiter);

// Swagger docs (unprotected)
setupSwagger(app);

// Auth routes (no auth required)
app.use("/auth", authRouter);

// Health check (unprotected). Echoes APP_ENV (non-secret) so you can confirm which
// environment a deployment is actually running — e.g. GET /health -> {status, env}.
app.get("/health", (_req, res) => {
  res.json({status: "ok", env: APP_ENV});
});

// Protected routes (auth required)
app.use(authMiddleware);

// OCR routes: allow larger payloads (base64 images)
app.use("/readings/ocr", express.json({limit: "1mb"}));
app.use("/billing-cycles/ocr", express.json({limit: "1mb"}));
app.use("/image-extraction", express.json({limit: "1mb"}));

app.use("/meter-groups", meterGroupRouter);
app.use("/properties", propertyRouter);
app.use("/tenants", tenantRouter);
app.use("/readings", readingRouter);
app.use("/billings", billingRouter);
app.use("/billing-cycles", billingCycleRouter);
app.use("/bills", billsRouter);
app.use("/users", userRouter);
app.use("/image-extraction", imageExtractionRouter);
app.use("/reports", reportsRouter);
app.use("/llm-config", llmConfigRouter);
app.use("/chatbot", chatbotRouter);

// Error handling
app.use(errorHandler);

// `invoker: 'public'` grants allUsers the Cloud Run invoker role so the API is reachable
// from browsers/mobile without IAM auth. Without it, Google's frontend returns 403 before
// the request reaches Express — which surfaces in the browser as a misleading CORS error
// (no Access-Control-Allow-Origin header, because our code never runs). App-level auth is
// still enforced by authMiddleware on protected routes.
export const api = onRequest({region: "asia-southeast1", invoker: "public"}, app);

// Local development server — only run when explicitly opted in (set by `npm run dev:watch`).
// MUST NOT run during `firebase deploy` source analysis or in the Cloud Run/Functions runtime:
// the Functions Framework binds its own port and sets process.env.PORT, so a stray app.listen()
// here double-binds that port -> EADDRINUSE. We guard with an explicit opt-in flag AND a check
// for Firebase-runtime env vars, and we never reuse Firebase's PORT.
const inFirebaseRuntime = Boolean(
  process.env.FUNCTION_TARGET ||
  process.env.K_SERVICE ||
  process.env.FUNCTIONS_CONTROL_API
);

if (process.env.START_LOCAL_SERVER === "true" && !inFirebaseRuntime) {
  const PORT = Number(process.env.LOCAL_SERVER_PORT) || 5002;
  const server = app.listen(PORT, () => {
    logger.info(`API server running on port ${PORT}`);
  });
  server.on("error", (error: NodeJS.ErrnoException) => {
    logger.error({error}, "Failed to start server");
    process.exit(1);
  });

  process.on("uncaughtException", (error) => {
    logger.error({error}, "Uncaught exception");
    process.exit(1);
  });

  process.on("unhandledRejection", (reason, promise) => {
    logger.error({reason, promise}, "Unhandled rejection");
    process.exit(1);
  });
}
