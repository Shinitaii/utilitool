import path from "node:path";
import dotenv from "dotenv";

// APP_ENV selects which Firebase project + secrets file to use.
// Its values MUST match the secrets/.env.<APP_ENV> filenames exactly.
//   staging    -> local dev + deployed staging (utilitool-staging)
//   production -> manual production deploy
//   test       -> jest + Firebase emulators
export const APP_ENV = (process.env.APP_ENV ?? "staging") as
  | "staging"
  | "production"
  | "test";

// Load secrets/.env.<APP_ENV>. Note: dotenv does NOT override variables already
// present in process.env (e.g. NODE_ENV / APP_ENV set by the run command), so the
// run command always wins over the file.
const envFile = path.resolve(process.cwd(), "secrets", `.env.${APP_ENV}`);
dotenv.config({path: envFile});

// "development" describes the local RUNTIME behaviour (mock OCR, localhost CORS).
// It is intentionally sourced from the run command (see `dev:watch`), never from an
// env file — a file-sourced NODE_ENV=development once leaked into `firebase deploy`
// and crashed the deploy by starting the local HTTP server during source analysis.
export const isDevelopment = process.env.NODE_ENV === "development";
export const isProduction = APP_ENV === "production";
export const isTest = APP_ENV === "test";

export const firebaseProjectId =
  process.env.GCLOUD_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.PROJECT_ID;

export const getFirebaseAppOptions = () => {
  const options: { projectId?: string; databaseURL?: string } = {};

  if (firebaseProjectId) {
    options.projectId = firebaseProjectId;
  }

  if (process.env.FIREBASE_DATABASE_URL) {
    options.databaseURL = process.env.FIREBASE_DATABASE_URL;
  }

  return options;
};
