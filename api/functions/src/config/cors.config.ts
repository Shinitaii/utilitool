import {CorsOptions} from "cors";
import {isEmulator} from "./env.config";

const productionOrigins: string[] = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const localhostPattern = /^http:\/\/localhost(:\d+)?$/;

export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }

    if (isEmulator && localhostPattern.test(origin)) {
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
