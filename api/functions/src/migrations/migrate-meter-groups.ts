/**
 * One-time migration: converts Property.meter_groups values from bare
 * meter_group_id strings to { meter_group_id, is_main_meter: false } objects.
 *
 * Run once against the target environment:
 *   APP_ENV=dev npx tsx src/migrations/migrate-meter-groups.ts
 *
 * Safe to re-run — skips documents already in the new format.
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

async function migrate(): Promise<void> {
  const snapshot = await db.collection(PROPERTIES_COLLECTION).get();
  let migrated = 0;
  let skipped = 0;

  const batch = db.batch();

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const meterGroups = data.meter_groups as Record<string, any>;

    if (!meterGroups) {
      skipped++;
      continue;
    }

    let needsMigration = false;
    const updated: Record<string, any> = {};

    for (const [utilityType, value] of Object.entries(meterGroups)) {
      if (typeof value === "string") {
        updated[utilityType] = { meter_group_id: value, is_main_meter: false };
        needsMigration = true;
      } else {
        // Already in new format — preserve as-is
        updated[utilityType] = value;
      }
    }

    if (!needsMigration) {
      skipped++;
      continue;
    }

    batch.update(doc.ref, { meter_groups: updated });
    migrated++;
  }

  await batch.commit();
  console.log(`Migration complete. Migrated: ${migrated}, Skipped: ${skipped}`);
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
