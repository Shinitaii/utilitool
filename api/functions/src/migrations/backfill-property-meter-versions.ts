/**
 * One-time migration: initializes per-submeter version tracking on Property.meter_groups.
 *
 * For every MeterGroupEntry where is_main_meter === false and current_version is not yet
 * set, stamps { current_version: 1, versions: {} }. Main-meter entries are left untouched —
 * they continue to resolve their version from the MeterGroup document.
 *
 * Usage (run from api/functions):
 *   # 1) DRY RUN (default) — counts only, writes nothing:
 *   APP_ENV=staging npx tsx src/migrations/backfill-property-meter-versions.ts
 *
 *   # 2) EXECUTE the backfill:
 *   APP_ENV=staging EXECUTE=true npx tsx src/migrations/backfill-property-meter-versions.ts
 *
 * Safe to re-run — skips entries that already have current_version set.
 */
import {initializeApp, cert} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";
import * as path from "path";

const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credentialsPath) {
  throw new Error("GOOGLE_APPLICATION_CREDENTIALS env var is required");
}

initializeApp({
  credential: cert(path.resolve(credentialsPath)),
});

const db = getFirestore();
const PROPERTIES_COLLECTION = "properties";

export async function backfillPropertyMeterVersions(): Promise<{migrated: number; skipped: number}> {
  const EXECUTE = process.env.EXECUTE === "true";
  const snapshot = await db.collection(PROPERTIES_COLLECTION).get();
  let migrated = 0;
  let skipped = 0;

  let batch = db.batch();
  let opsInBatch = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const meterGroups = data.meter_groups as Record<string, any> | undefined;

    if (!meterGroups) {
      skipped++;
      continue;
    }

    let needsMigration = false;
    const updated: Record<string, any> = {};

    for (const [utilityType, entry] of Object.entries(meterGroups)) {
      if (
        entry &&
        typeof entry === "object" &&
        entry.is_main_meter === false &&
        entry.current_version === undefined
      ) {
        updated[utilityType] = {...entry, current_version: 1, versions: {}};
        needsMigration = true;
      } else {
        updated[utilityType] = entry;
      }
    }

    if (!needsMigration) {
      skipped++;
      continue;
    }

    migrated++;

    if (EXECUTE) {
      batch.update(doc.ref, {meter_groups: updated, updated_at: new Date()});
      opsInBatch++;

      if (opsInBatch >= 499) {
        await batch.commit();
        batch = db.batch();
        opsInBatch = 0;
      }
    }
  }

  if (EXECUTE && opsInBatch > 0) {
    await batch.commit();
  }

  return {migrated, skipped};
}

if (require.main === module) {
  const execute = process.env.EXECUTE === "true";
  backfillPropertyMeterVersions()
    .then(({migrated, skipped}) => {
      console.log(
        `${execute ? "Migration" : "Dry run"} complete. ${execute ? "Migrated" : "Would migrate"}: ${migrated}, Skipped: ${skipped}`
      );
      process.exit(0);
    })
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exit(1);
    });
}
