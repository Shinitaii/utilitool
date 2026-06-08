/**
 * One-time migration: moves ALL per-meter version tracking onto Property.meter_groups,
 * completing the transition away from MeterGroup-level version fields.
 *
 * - Submeter entries (is_main_meter === false) with no current_version: stamped fresh,
 *   { current_version: 1, versions: {} } (they never had meter-group-level history to inherit).
 * - Main-meter entries (is_main_meter === true) with no current_version: backfilled by
 *   COPYING current_version/versions from their referenced MeterGroup document, so the
 *   property entry becomes the new source of truth and MeterGroup.current_version/versions
 *   can eventually be removed without data loss.
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
const METER_GROUPS_COLLECTION = "meter_groups";

export async function backfillPropertyMeterVersions(): Promise<{migrated: number; skipped: number}> {
  const EXECUTE = process.env.EXECUTE === "true";
  const snapshot = await db.collection(PROPERTIES_COLLECTION).get();
  let migrated = 0;
  let skipped = 0;

  // Pre-fetch every meter group referenced by a main-meter entry so we can copy its
  // current_version/versions onto the property entry (one read instead of N per property).
  const referencedMeterGroupIds = new Set<string>();
  for (const doc of snapshot.docs) {
    const meterGroups = doc.data().meter_groups as Record<string, any> | undefined;
    if (!meterGroups) continue;
    for (const entry of Object.values(meterGroups)) {
      if (entry && typeof entry === "object" && entry.is_main_meter === true && entry.current_version === undefined) {
        referencedMeterGroupIds.add(entry.meter_group_id);
      }
    }
  }

  const meterGroupMap = new Map<string, {current_version?: number; versions?: Record<string, unknown>}>();
  await Promise.all(
    Array.from(referencedMeterGroupIds).map(async (id) => {
      const mgDoc = await db.collection(METER_GROUPS_COLLECTION).doc(id).get();
      if (mgDoc.exists) {
        const mgData = mgDoc.data()!;
        meterGroupMap.set(id, {current_version: mgData.current_version, versions: mgData.versions});
      }
    })
  );

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
      if (entry && typeof entry === "object" && entry.current_version === undefined) {
        if (entry.is_main_meter === false) {
          updated[utilityType] = {...entry, current_version: 1, versions: {}};
          needsMigration = true;
        } else if (entry.is_main_meter === true) {
          const source = meterGroupMap.get(entry.meter_group_id);
          updated[utilityType] = {
            ...entry,
            current_version: source?.current_version ?? 1,
            versions: source?.versions ?? {},
          };
          needsMigration = true;
        } else {
          updated[utilityType] = entry;
        }
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
