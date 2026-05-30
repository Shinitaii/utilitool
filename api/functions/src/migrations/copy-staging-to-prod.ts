/**
 * One-way data copy: utilitool-staging Firestore -> utilitool-11d7c (production).
 *
 * Copies the business collections VERBATIM (including soft-deleted docs), preserving
 * document IDs so all cross-references stay intact (billings -> reading ids,
 * properties -> meter_group ids, etc.). Existing prod docs with the same ID are
 * OVERWRITTEN (set). The `users` collection is intentionally NOT copied — Firebase Auth
 * UIDs don't transfer between projects, so re-register in prod and the users/{uid} doc
 * auto-creates on first GET /auth/me.
 *
 * Usage (run from api/functions):
 *   # 1) DRY RUN (default) — counts only, writes nothing:
 *   npx tsx src/migrations/copy-staging-to-prod.ts
 *
 *   # 2) EXECUTE the copy:
 *   EXECUTE=true npx tsx src/migrations/copy-staging-to-prod.ts
 *
 * Credential key paths (override if your filenames differ):
 *   STAGING_CREDENTIALS=secrets/utilitool-staging-firebase-adminsdk-fbsvc-50221e4bd0.json
 *   PROD_CREDENTIALS=secrets/utilitool-11d7c-firebase-adminsdk-fbsvc-5f47e8736d.json
 */
import {initializeApp, cert, type ServiceAccount} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";
import * as fs from "node:fs";
import * as path from "node:path";

const STAGING_KEY = process.env.STAGING_CREDENTIALS ||
  "secrets/utilitool-staging-firebase-adminsdk-fbsvc-50221e4bd0.json";
const PROD_KEY = process.env.PROD_CREDENTIALS ||
  "secrets/utilitool-11d7c-firebase-adminsdk-fbsvc-5f47e8736d.json";

const EXECUTE = process.env.EXECUTE === "true";

// Business collections to copy. `users` is intentionally excluded (see header).
const COLLECTIONS = [
  "meter_groups",
  "properties",
  "tenants",
  "readings",
  "billings",
  "billing_cycles",
  "audits",
];

// Read a service-account key, stripping a UTF-8 BOM if present (Windows editors add one,
// which breaks JSON.parse / cert()).
function loadKey(p: string): ServiceAccount {
  const raw = fs.readFileSync(path.resolve(p), "utf8").replace(/^﻿/, "");
  return JSON.parse(raw) as ServiceAccount;
}

const stagingApp = initializeApp({credential: cert(loadKey(STAGING_KEY))}, "staging");
const prodApp = initializeApp({credential: cert(loadKey(PROD_KEY))}, "prod");

const stagingDb = getFirestore(stagingApp);
const prodDb = getFirestore(prodApp);

const BATCH_LIMIT = 450; // Firestore hard limit is 500 ops per batch.

async function copyCollection(name: string): Promise<{copied: number}> {
  const snapshot = await stagingDb.collection(name).get();

  if (!EXECUTE) {
    return {copied: snapshot.size}; // dry run: just report what WOULD be copied
  }

  let batch = prodDb.batch();
  let opsInBatch = 0;
  let copied = 0;

  for (const doc of snapshot.docs) {
    // set() with the SAME id preserves references and overwrites any existing prod doc.
    batch.set(prodDb.collection(name).doc(doc.id), doc.data());
    opsInBatch++;
    copied++;

    if (opsInBatch >= BATCH_LIMIT) {
      await batch.commit();
      batch = prodDb.batch();
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
    `${EXECUTE ? "EXECUTING" : "DRY RUN"} copy: utilitool-staging -> utilitool-11d7c\n` +
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
    console.log("Re-run with EXECUTE=true to perform the copy.");
  }
}

main().catch((err) => {
  console.error("Copy failed:", err);
  process.exit(1);
});
