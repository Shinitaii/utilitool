/**
 * Shadow-replay diagnostic: runs the REAL report/validator logic (not a reimplementation)
 * against whatever Firestore the app is currently pointed at, and dumps a JSON snapshot.
 *
 * Intended use (verifying the hardening-roadmap-phase1 changes don't silently change
 * business-logic output before they reach production):
 *   1. Populate the local emulator with real-shaped data:
 *      `npx tsx src/migrations/copy-staging-to-emulator.ts` (dry run), then with
 *      EXECUTE=true, against a running emulator (`npm run test:emulator` in another shell).
 *   2. Run this script with the OLD code (before this diff) -> save output A.
 *   3. Run this script with the NEW code (current working tree) -> save output B.
 *   4. Diff A and B — any unexpected difference in report totals/tenant-cap flags/legacy
 *      shape counts is a real, silent behavior change worth investigating before merge.
 *
 * Usage (run from api/functions, against the local emulator — never against staging/prod):
 *   APP_ENV=test FIRESTORE_EMULATOR_HOST=localhost:8080 npx tsx src/migrations/shadow-replay.ts > /tmp/replay-before.json
 *   # ...checkout/stash to the other code version...
 *   APP_ENV=test FIRESTORE_EMULATOR_HOST=localhost:8080 npx tsx src/migrations/shadow-replay.ts > /tmp/replay-after.json
 *   diff /tmp/replay-before.json /tmp/replay-after.json
 *
 * Refuses to run unless FIRESTORE_EMULATOR_HOST is set, so it can never be pointed at a
 * real project by accident.
 */
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error(
    "FIRESTORE_EMULATOR_HOST is not set. Refusing to run: this script calls production " +
    "business logic (reports.service, tenant.validator) and must only ever run against the " +
    "local Firestore emulator, never staging or production."
  );
}

import {firestore} from "../config/firebase.config";
import {COLLECTIONS} from "../constants/collection.constants";
import {getSummary, getCollectionStatus, getConsumption} from "../features/reports/reports.service";

const SHADOW_USER_ID = "shadow-replay"; // unused by reports.service today, passed for signature only

async function replayReports() {
  const query = {}; // no filters — broadest possible comparison surface
  return {
    summary: await getSummary(SHADOW_USER_ID, query),
    collectionStatus: await getCollectionStatus(SHADOW_USER_ID, query),
    consumption: await getConsumption(SHADOW_USER_ID, query),
  };
}

/**
 * Mirrors the item-1 audit question directly: scans every property for legacy
 * string-shaped meter_groups entries (pre migrate-meter-groups.ts shape) and counts
 * entries still missing current_version (pending backfill-property-meter-versions.ts).
 */
async function scanMeterGroupShapes() {
  const snapshot = await firestore.collection(COLLECTIONS.PROPERTIES).get();

  let propertiesScanned = 0;
  let legacyStringEntries = 0;
  let objectEntriesMissingCurrentVersion = 0;
  const legacyStringEntryPropertyIds: string[] = [];

  for (const doc of snapshot.docs) {
    propertiesScanned++;
    const meterGroups = doc.data().meter_groups as Record<string, unknown> | undefined;
    if (!meterGroups) continue;

    for (const entry of Object.values(meterGroups)) {
      if (typeof entry === "string") {
        legacyStringEntries++;
        legacyStringEntryPropertyIds.push(doc.id);
      } else if (entry && typeof entry === "object" && (entry as {current_version?: number}).current_version === undefined) {
        objectEntriesMissingCurrentVersion++;
      }
    }
  }

  return {
    propertiesScanned,
    legacyStringEntries,
    legacyStringEntryPropertyIds,
    objectEntriesMissingCurrentVersion,
  };
}

/**
 * Dry-run tenant-cap check (read-only, does not create/reject anything): for every
 * property, compares active (non-deleted) tenant count against tenant_amount. Flags any
 * property already at/over cap, which is informational only — the real enforcement is
 * the transactional check in tenant.service.ts.
 */
async function scanTenantCaps() {
  const propertiesSnap = await firestore.collection(COLLECTIONS.PROPERTIES)
    .where("is_deleted", "==", false)
    .get();

  const results: {propertyId: string; tenantAmount: number; activeTenantCount: number; atOrOverCap: boolean}[] = [];

  for (const propDoc of propertiesSnap.docs) {
    const property = propDoc.data();
    const tenantsSnap = await firestore.collection(COLLECTIONS.TENANTS)
      .where("property_id", "==", propDoc.id)
      .where("is_deleted", "==", false)
      .get();

    results.push({
      propertyId: propDoc.id,
      tenantAmount: property.tenant_amount,
      activeTenantCount: tenantsSnap.size,
      atOrOverCap: tenantsSnap.size >= property.tenant_amount,
    });
  }

  return {
    propertiesChecked: results.length,
    atOrOverCap: results.filter((r) => r.atOrOverCap),
    all: results,
  };
}

async function main() {
  const output = {
    ranAt: new Date().toISOString(),
    firestoreEmulatorHost: process.env.FIRESTORE_EMULATOR_HOST,
    reports: await replayReports(),
    meterGroupShapes: await scanMeterGroupShapes(),
    tenantCaps: await scanTenantCaps(),
  };

  // Deterministic key order not required for diffing (JSON.stringify with 2-space
  // indent is stable per-run for a fixed data set) — pretty-print to stdout so the
  // caller can redirect to a file and `diff` two runs.
  console.log(JSON.stringify(output, null, 2));
}

main().catch((err) => {
  console.error("Shadow replay failed:", err);
  process.exit(1);
});
