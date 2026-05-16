// index.ts
import {setGlobalOptions} from "firebase-functions";
import {onRequest} from "firebase-functions/v2/https";
import {requestLogger} from "./middlewares/request-logger.middleware";
import {errorHandler} from "./middlewares/error-handler.middleware";
import express from "express";
import meterGroupRoutes from "./features/meter-group/meter-group.route";
import propertyRoutes from "./features/property/property.route";
import tenantRoutes from "./features/tenant/tenant.route";
import "express-async-errors";

setGlobalOptions({maxInstances: 2});

const app = express();
// Logging
app.use(requestLogger);

// Content-Type parsing
app.use(express.json());

// Add CORS middleware
// Add helmet middleware
// Add rate limiter middleware
// Add authentication middleware
// Add global validation + sanitation middleware

// All feature routes
app.use("/meter-groups", meterGroupRoutes);
app.use("/properties", propertyRoutes);
app.use("/tenants", tenantRoutes);


// Global error handler
app.use(errorHandler);

// Export as Firebase function
export const api = onRequest(app);
