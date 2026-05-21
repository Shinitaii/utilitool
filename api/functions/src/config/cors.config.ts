import {CorsOptions} from "cors";
import {isDevelopment} from "./env.config";
import {logger} from "../utils/logger.util";

const productionOrigins: string[] = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

if (!isDevelopment && productionOrigins.length === 0) {
  logger.error("ALLOWED_ORIGINS is not set. All cross-origin requests will be blocked. Set ALLOWED_ORIGINS in your environment.");
}

const localhostPattern = /^http:\/\/localhost(:\d+)?$/;

export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }

    if (isDevelopment && localhostPattern.test(origin)) {
      callback(null, true);
      return;
    }

    if (productionOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`CORS: origin '${origin}' not allowed`));
  },
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type"],
  credentials: true,
  optionsSuccessStatus: 204,
};
