import * as admin from "firebase-admin";
import * as fs from "node:fs";

// Side-effect import: env.config calls dotenv.config() to load secrets/.env.<APP_ENV>
// (e.g. FIRESTORE_EMULATOR_HOST, PROJECT_ID for `test`). Without this import, files that
// reach firebase.config without first importing env.config (e.g. test suites importing
// repositories directly) would read process.env before the secrets file is loaded.
import "./env.config";

// When the Firestore emulator host is set (test / dev:emulator), the Admin SDK talks to
// the local emulators and does NOT need a real service-account credential — initialize
// with the project id only. Otherwise use the service-account key file.
const useEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

// Read the service-account key ourselves and strip a UTF-8 BOM if present, then pass the
// parsed object to cert(). Some editors (especially on Windows) save the key file with a
// BOM, which makes firebase-admin's path-based cert() throw "Unexpected token" at startup
// and crash the Cloud Run container before it can listen on PORT.
function loadServiceAccount(filePath: string): admin.ServiceAccount {
  const raw = fs.readFileSync(filePath, "utf8").replace(/^﻿/, "");
  return JSON.parse(raw) as admin.ServiceAccount;
}

if (!admin.apps.length) {
  if (useEmulator) {
    admin.initializeApp({
      projectId:
        process.env.GCLOUD_PROJECT ||
        process.env.GOOGLE_CLOUD_PROJECT ||
        process.env.PROJECT_ID,
    });
  } else {
    admin.initializeApp({
      credential: admin.credential.cert(
        loadServiceAccount(process.env.GOOGLE_APPLICATION_CREDENTIALS as string),
      ),
    });
  }
}

export const firestore = admin.firestore();
firestore.settings({ignoreUndefinedProperties: true});

export const firebaseApp = admin.app();

export const getRealtimeDb = () => admin.database();
