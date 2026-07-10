import {CorsOptions} from "cors";
import {isDevelopment} from "./env.config";

// Capacitor mobile app origins. These are fixed by the native WebView (androidScheme:
// "https" -> https://localhost on Android; capacitor://localhost on iOS), so they are
// always allowed and never depend on ALLOWED_ORIGINS. CORS is not the security boundary
// here — the Bearer token is — so allowlisting the app's own origin is safe.
const mobileAppOrigins = ["https://localhost", "capacitor://localhost"];

// Web origins (Vercel deployments). These vary per environment, so they come from config.
const webOrigins: string[] = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

if (!isDevelopment && webOrigins.length === 0) {
  // Fail fast at startup: a non-dev deploy with no web origins is a misconfiguration
  // that would silently break the web app. Crash now so it's caught at deploy time.
  // (The mobile app uses fixed Capacitor origins and is unaffected by ALLOWED_ORIGINS.)
  throw new Error(
    "ALLOWED_ORIGINS is not set in a non-development environment. " +
    "Set ALLOWED_ORIGINS to your Vercel domain(s) before deploying."
  );
}

const localhostPattern = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }

    // Mobile app — always allowed regardless of environment/config
    if (mobileAppOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    if (isDevelopment && localhostPattern.test(origin)) {
      callback(null, true);
      return;
    }

    if (webOrigins.includes(origin)) {
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
