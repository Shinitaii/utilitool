import path from "node:path";
import dotenv from "dotenv";

export const nodeEnv = (process.env.NODE_ENV ?? "development") as
  | "development"
  | "staging"
  | "production";

export const isDevelopment = nodeEnv === "development";

const bootstrapEnv = process.env.APP_ENV ?? nodeEnv;

const envFile = path.resolve(process.cwd(), "secrets", `.env.${bootstrapEnv}`);
dotenv.config({path: envFile});

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
