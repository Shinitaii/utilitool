/**
 * One-time backfill: denormalizes meter_group_id + billing_period_date onto existing
 * Billing documents, resolved from each billing's current_reading_id. Idempotent — already
 * backfilled billings are skipped, so it's safe to re-run.
 *
 * Usage (from api/functions/):
 *   APP_ENV=staging GOOGLE_APPLICATION_CREDENTIALS=... npx ts-node scripts/backfill-billing-meter-group.ts --dry-run
 *   APP_ENV=staging GOOGLE_APPLICATION_CREDENTIALS=... npx ts-node scripts/backfill-billing-meter-group.ts --apply
 *
 * --dry-run (default if neither flag is passed) writes a report to
 * scripts/backfill-billing-meter-group.report.json and performs no writes.
 * --apply performs the writes, in batches of 500 (Firestore batch limit).
 */
import * as fs from "node:fs";
import * as path from "node:path";
import {firestore} from "../src/config/firebase.config";
import {COLLECTIONS} from "../src/constants/collection.constants";

const BATCH_LIMIT = 500;
const REPORT_PATH = path.join(__dirname, "backfill-billing-meter-group.report.json");

interface ReportEntry {
  billingId: string;
  currentReadingId: string;
  status: "resolved" | "already-backfilled" | "reading-not-found";
  meterGroupId?: string;
  billingPeriodDate?: string;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const mode = apply ? "apply" : "dry-run";
  console.log(`Running backfill in ${mode} mode...`);

  const billingsSnap = await firestore.collection(COLLECTIONS.BILLINGS).get();
  console.log(`Found ${billingsSnap.size} billing documents.`);

  const report: ReportEntry[] = [];
  const toWrite: { ref: FirebaseFirestore.DocumentReference; meterGroupId: string; billingPeriodDate: FirebaseFirestore.Timestamp }[] = [];

  // Firestore getAll() accepts many refs in one round trip; chunk to stay well under
  // request-size limits.
  const readingIds = Array.from(
    new Set(billingsSnap.docs.map((d) => d.data().current_reading_id as string).filter(Boolean))
  );
  const readingById = new Map<string, FirebaseFirestore.DocumentData>();
  const CHUNK = 300;
  for (let i = 0; i < readingIds.length; i += CHUNK) {
    const chunk = readingIds.slice(i, i + CHUNK);
    const refs = chunk.map((id) => firestore.collection(COLLECTIONS.READINGS).doc(id));
    const snaps = await firestore.getAll(...refs);
    snaps.forEach((snap, idx) => {
      if (snap.exists) readingById.set(chunk[idx], snap.data()!);
    });
  }

  for (const doc of billingsSnap.docs) {
    const data = doc.data();
    const currentReadingId = data.current_reading_id as string;

    if (data.meter_group_id && data.billing_period_date) {
      report.push({
        billingId: doc.id,
        currentReadingId,
        status: "already-backfilled",
        meterGroupId: data.meter_group_id,
      });
      continue;
    }

    const reading = readingById.get(currentReadingId);
    if (!reading) {
      report.push({billingId: doc.id, currentReadingId, status: "reading-not-found"});
      continue;
    }

    report.push({
      billingId: doc.id,
      currentReadingId,
      status: "resolved",
      meterGroupId: reading.meter_group_id,
      billingPeriodDate: reading.reading_date?.toDate?.().toISOString(),
    });
    toWrite.push({
      ref: doc.ref,
      meterGroupId: reading.meter_group_id,
      billingPeriodDate: reading.reading_date,
    });
  }

  const resolved = report.filter((r) => r.status === "resolved").length;
  const alreadyDone = report.filter((r) => r.status === "already-backfilled").length;
  const failed = report.filter((r) => r.status === "reading-not-found").length;
  console.log(`Resolved: ${resolved}, already backfilled: ${alreadyDone}, failed: ${failed}`);

  fs.writeFileSync(REPORT_PATH, JSON.stringify({mode, resolved, alreadyDone, failed, entries: report}, null, 2));
  console.log(`Report written to ${REPORT_PATH}`);

  if (!apply) {
    console.log("Dry-run complete. No writes performed. Re-run with --apply to write changes.");
    return;
  }

  if (failed > 0) {
    console.warn(`WARNING: ${failed} billing(s) could not be resolved (see report) — these will remain un-backfilled.`);
  }

  for (let i = 0; i < toWrite.length; i += BATCH_LIMIT) {
    const chunk = toWrite.slice(i, i + BATCH_LIMIT);
    const batch = firestore.batch();
    for (const item of chunk) {
      batch.update(item.ref, {
        meter_group_id: item.meterGroupId,
        billing_period_date: item.billingPeriodDate,
      });
    }
    await batch.commit();
    console.log(`Wrote batch ${i / BATCH_LIMIT + 1} (${chunk.length} documents).`);
  }

  console.log(`Apply complete. ${toWrite.length} billing document(s) updated.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
