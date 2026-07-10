/**
 * One-way, READ-ONLY-on-staging data copy: utilitool-staging Firestore -> the local
 * Firestore emulator (project utilitool-test). Lets shadow-replay.ts (and the E2E suite,
 * via ui/e2e/global-setup.ts SEED_FROM_STAGING=true) exercise real-shaped data without
 * ever writing to staging or touching production.
 *
 * IMPORTANT — do NOT set FIRESTORE_EMULATOR_HOST in the shell for this script. The Admin
 * SDK checks that env var process-wide, not per-app: setting it redirects BOTH the
 * "staging" client (meant to read the real project via a real credential) and the
 * emulator client to the emulator, silently turning the "staging" reads into queries
 * against the emulator's own (usually empty) utilitool-test project — which is exactly
 * what produced "copied 0 docs" plus the emulator's "Requested project ID utilitool-staging,
 * but the emulator is configured for utilitool-test" warning the first time this ran.
 * Instead, this script reads the emulator target from EMULATOR_HOST and applies it via an
 * explicit `.settings()` call on ONLY the emulator Firestore instance, leaving the staging
 * instance's real-project connection untouched.
 *
 * Safety: refuses to run unless EMULATOR_HOST is set, and the destination project id is
 * hardcoded to "utilitool-test" (not configurable) — this script cannot be pointed at a
 * real project as the destination even by mistake.
 *
 * Usage (run from api/functions, with the Firestore emulator already running —
 * e.g. `npm run test:emulator` in another terminal):
 *   # 1) DRY RUN (default) — counts only, writes nothing:
 *   EMULATOR_HOST=localhost:8080 npx tsx src/migrations/copy-staging-to-emulator.ts
 *
 *   # 2) EXECUTE the copy into the emulator:
 *   EMULATOR_HOST=localhost:8080 EXECUTE=true npx tsx src/migrations/copy-staging-to-emulator.ts
 *
 * Credential key path (override if your filename differs):
 *   STAGING_CREDENTIALS=secrets/utilitool-staging-firebase-adminsdk-fbsvc-50221e4bd0.json
 */
import {initializeApp, cert, type ServiceAccount} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";
import * as fs from "node:fs";
import * as path from "node:path";

if (process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error(
    "FIRESTORE_EMULATOR_HOST is set — refusing to run. That env var redirects BOTH Firestore " +
    "clients in this process to the emulator (including the one meant to read real staging " +
    "data with a real credential). Unset it and pass EMULATOR_HOST=localhost:8080 instead."
  );
}

if (!process.env.EMULATOR_HOST) {
  throw new Error(
    "EMULATOR_HOST is not set. Refusing to run: this script's destination is hardcoded to " +
    "the local emulator, and without this env var there's nothing to point the destination " +
    "client at. Example: EMULATOR_HOST=localhost:8080"
  );
}

const STAGING_KEY = process.env.STAGING_CREDENTIALS ||
  "secrets/utilitool-staging-firebase-adminsdk-fbsvc-50221e4bd0.json";
const EMULATOR_PROJECT_ID = "utilitool-test"; // matches secrets/.env.test and ui/e2e/global-setup.ts

const EXECUTE = process.env.EXECUTE === "true";

// Business collections to copy. `users` is intentionally excluded — Firebase Auth UIDs
// don't transfer between projects (same rationale as copy-staging-to-prod.ts).
const COLLECTIONS = [
  "meter_groups",
  "properties",
  "tenants",
  "readings",
  "billings",
  "billing_cycles",
  "audits",
];

function loadKey(p: string): ServiceAccount {
  // eslint-disable-next-line no-irregular-whitespace -- strips a literal BOM character
  const raw = fs.readFileSync(path.resolve(p), "utf8").replace(/^﻿/, "");
  return JSON.parse(raw) as ServiceAccount;
}

const stagingApp = initializeApp({credential: cert(loadKey(STAGING_KEY))}, "staging-readonly");
const emulatorApp = initializeApp({projectId: EMULATOR_PROJECT_ID}, "emulator-dest");

const stagingDb = getFirestore(stagingApp);
const emulatorDb = getFirestore(emulatorApp);
// Explicit, app-scoped emulator routing — NOT via the process-wide FIRESTORE_EMULATOR_HOST
// env var, so the stagingDb connection above is unaffected.
emulatorDb.settings({host: process.env.EMULATOR_HOST, ssl: false});

const BATCH_LIMIT = 450; // Firestore hard limit is 500 ops per batch.

async function copyCollection(name: string): Promise<{copied: number}> {
  const snapshot = await stagingDb.collection(name).get(); // READ-ONLY against staging

  if (!EXECUTE) {
    return {copied: snapshot.size}; // dry run: just report what WOULD be copied
  }

  let batch = emulatorDb.batch();
  let opsInBatch = 0;
  let copied = 0;

  for (const doc of snapshot.docs) {
    batch.set(emulatorDb.collection(name).doc(doc.id), doc.data());
    opsInBatch++;
    copied++;

    if (opsInBatch >= BATCH_LIMIT) {
      await batch.commit();
      batch = emulatorDb.batch();
      opsInBatch = 0;
    }
  }

  if (opsInBatch > 0) {
    await batch.commit();
  }

  return {copied};
}

async function main(): Promise<void> {
  console.log(
    `${EXECUTE ? "EXECUTING" : "DRY RUN"} copy: utilitool-staging (read-only) -> local emulator (${EMULATOR_PROJECT_ID})\n` +
    `Collections: ${COLLECTIONS.join(", ")} (users excluded)\n`
  );

  let total = 0;
  for (const name of COLLECTIONS) {
    const {copied} = await copyCollection(name);
    total += copied;
    console.log(`  ${name.padEnd(16)} ${EXECUTE ? "copied" : "would copy"} ${copied} docs`);
  }

  console.log(`\n${EXECUTE ? "Done" : "Dry run complete"}. Total: ${total} docs.`);
  if (!EXECUTE) {
    console.log("Re-run with EXECUTE=true to perform the copy into the emulator.");
  }
}

main().catch((err) => {
  console.error("Copy failed:", err);
  process.exit(1);
});
