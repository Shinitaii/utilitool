import {FieldValue, Timestamp} from "firebase-admin/firestore";
import {firestore} from "../config/firebase.config";
import {COLLECTIONS} from "../constants/collection.constants";
import {collectionRef} from "../lib/firestore.lib";
import {cacheDel, cacheDelPattern} from "./cache.util";
import {AppError} from "./error.util";
import {readingLockId, isAlreadyExistsError} from "../features/reading/reading.util";

type CascadeMode = "soft-delete" | "restore" | "purge";

/**
 * Release the "one reading per meter_group+property+month" lock doc (see
 * reading.util.ts) for a reading being soft-deleted, so a legitimate
 * delete-then-recreate within the same month isn't permanently blocked by a
 * lock document that outlives the reading it was created for.
 */
function releaseReadingLock(
  txn: FirebaseFirestore.Transaction,
  meterGroupId: string,
  propertyId: string,
  readingDate: Timestamp
): void {
  const lockRef = firestore.collection(COLLECTIONS.READING_LOCKS).doc(
    readingLockId(meterGroupId, propertyId, readingDate)
  );
  txn.delete(lockRef);
}

/**
 * Re-claim the reading lock for a reading being restored, mirroring
 * `releaseReadingLock`. Uses `create` (not `set`): two different soft-deleted
 * readings can legitimately share the same meter_group+property+month key
 * (e.g. reading A created, deleted, reading B created for the same slot,
 * deleted too) — if both were ever restored, `set` would let both re-claim
 * the same slot silently, reintroducing two simultaneously-active readings
 * for one month with no error. `create` enforces the invariant here exactly
 * like it does on the write path; callers must catch ALREADY_EXISTS.
 */
function reclaimReadingLock(
  txn: FirebaseFirestore.Transaction,
  meterGroupId: string,
  propertyId: string,
  readingDate: Timestamp
): void {
  const lockRef = firestore.collection(COLLECTIONS.READING_LOCKS).doc(
    readingLockId(meterGroupId, propertyId, readingDate)
  );
  txn.create(lockRef, {created_at: FieldValue.serverTimestamp()});
}

/**
 * Runs a cascade transaction, converting a reading-lock ALREADY_EXISTS
 * conflict (see `reclaimReadingLock`) into a clean 409 instead of letting the
 * raw Firestore error bubble up as a 500.
 */
async function runCascadeTransaction(fn: (txn: FirebaseFirestore.Transaction) => Promise<void>): Promise<void> {
  try {
    await firestore.runTransaction(fn);
  } catch (err) {
    if (isAlreadyExistsError(err)) {
      throw new AppError(
        409,
        "Cannot restore: another active reading already occupies this meter group/property/month."
      );
    }
    throw err;
  }
}

/**
 * Invalidate the active-list caches (all users) for the given feature names.
 * Cascade ops touch many documents at once, so a wholesale pattern-delete is
 * simpler and safer than per-item list mutation — the next GET repopulates
 * cleanly from Firestore.
 */
async function invalidateListCaches(featureNames: string[]): Promise<void> {
  await Promise.all(featureNames.map((featureName) => cacheDelPattern(`utilitool:${featureName}:all:*`)));
}

/** Soft-delete/restore/hard-delete a single doc ref per cascade mode. */
function mutateDoc(txn: FirebaseFirestore.Transaction, ref: FirebaseFirestore.DocumentReference, mode: CascadeMode): void {
  if (mode === "purge") txn.delete(ref);
  else if (mode === "soft-delete") txn.update(ref, {is_deleted: true, deleted_at: new Date()});
  else txn.update(ref, {is_deleted: false, deleted_at: null});
}

function assertExists(snap: FirebaseFirestore.DocumentSnapshot, label: string): void {
  if (!snap.exists) throw new AppError(404, `${label} not found`);
}

function assertArchivedForPurge(snap: FirebaseFirestore.DocumentSnapshot, label: string): void {
  assertExists(snap, label);
  if (snap.data()?.is_deleted !== true) {
    throw new AppError(409, `Cannot permanently delete an active ${label.toLowerCase()}. Archive it first.`);
  }
}

/**
 * Query readings by `field == value` (scoped to the appropriate is_deleted
 * state for the given mode) and mutate each one in the transaction,
 * releasing/reclaiming its month lock along the way. Returns the matched IDs.
 */
async function cascadeReadingsBy(
  txn: FirebaseFirestore.Transaction,
  field: "property_id" | "meter_group_id",
  value: string,
  mode: CascadeMode
): Promise<string[]> {
  const snap = await collectionRef(COLLECTIONS.READINGS)
    .where(field, "==", value)
    .where("is_deleted", "==", mode !== "soft-delete")
    .get();

  for (const doc of snap.docs) {
    mutateDoc(txn, doc.ref, mode);
    if (mode === "purge") continue;
    const data = doc.data();
    if (mode === "soft-delete") releaseReadingLock(txn, data.meter_group_id, data.property_id, data.reading_date);
    else reclaimReadingLock(txn, data.meter_group_id, data.property_id, data.reading_date);
  }

  return snap.docs.map((doc) => doc.id);
}

/** Query billings directly by property_id and mutate each in the transaction. */
async function cascadeBillingsByPropertyId(
  txn: FirebaseFirestore.Transaction,
  propertyId: string,
  mode: CascadeMode
): Promise<string[]> {
  const snap = await collectionRef(COLLECTIONS.BILLINGS)
    .where("property_id", "==", propertyId)
    .where("is_deleted", "==", mode !== "soft-delete")
    .get();

  snap.docs.forEach((doc) => mutateDoc(txn, doc.ref, mode));
  return snap.docs.map((doc) => doc.id);
}

/**
 * Find billings referencing any of the given reading IDs (as previous or
 * current reading) and mutate each in the transaction. Skips the query
 * entirely when there are no reading IDs to match, avoiding a wasted scan.
 */
async function cascadeBillingsByReadingIds(
  txn: FirebaseFirestore.Transaction,
  readingIds: string[],
  mode: CascadeMode
): Promise<string[]> {
  if (readingIds.length === 0) return [];

  const snap = await collectionRef(COLLECTIONS.BILLINGS).where("is_deleted", "==", mode !== "soft-delete").get();

  const idSet = new Set(readingIds);
  const matched = snap.docs.filter((doc) => {
    const billing = doc.data();
    return idSet.has(billing.previous_reading_id) || idSet.has(billing.current_reading_id);
  });

  matched.forEach((doc) => mutateDoc(txn, doc.ref, mode));
  return matched.map((doc) => doc.id);
}

async function refreshCaches(
  entityCollectionCacheName: string,
  entityId: string,
  readingIds: string[],
  billingIds: string[],
  listCacheNames: string[]
): Promise<void> {
  await cacheDel(`utilitool:${entityCollectionCacheName}:id:${entityId}`);
  await Promise.all(readingIds.map((id) => cacheDel(`utilitool:readings:id:${id}`)));
  await Promise.all(billingIds.map((id) => cacheDel(`utilitool:billings:id:${id}`)));
  await invalidateListCaches(listCacheNames);
}

export interface CascadeDeleteSummary {
  primary: number; // The entity being deleted (always 1)
  readings?: number;
  billings?: number;
}

/**
 * Archive a property and all its readings + billings (cascading soft-delete).
 * Uses a transaction for atomicity.
 */
export async function cascadeDeleteProperty(propertyId: string): Promise<CascadeDeleteSummary> {
  let readingIds: string[] = [];
  let billingIds: string[] = [];

  await firestore.runTransaction(async (txn) => {
    const propertyRef = firestore.collection(COLLECTIONS.PROPERTIES).doc(propertyId);
    assertExists(await txn.get(propertyRef), "Property");
    txn.update(propertyRef, {is_deleted: true, deleted_at: new Date()});

    readingIds = await cascadeReadingsBy(txn, "property_id", propertyId, "soft-delete");
    billingIds = await cascadeBillingsByPropertyId(txn, propertyId, "soft-delete");
  });

  await refreshCaches("properties", propertyId, readingIds, billingIds, ["properties", "readings", "billings"]);

  return {primary: 1, readings: readingIds.length, billings: billingIds.length};
}

/**
 * Archive a meter group and all its readings + billings (cascading soft-delete).
 * Readings are filtered by meter_group_id, and billings by those reading IDs.
 * Uses a transaction for atomicity.
 */
export async function cascadeDeleteMeterGroup(meterGroupId: string): Promise<CascadeDeleteSummary> {
  let readingIds: string[] = [];
  let billingIds: string[] = [];

  await firestore.runTransaction(async (txn) => {
    const meterGroupRef = firestore.collection(COLLECTIONS.METER_GROUPS).doc(meterGroupId);
    assertExists(await txn.get(meterGroupRef), "Meter group");
    txn.update(meterGroupRef, {is_deleted: true, deleted_at: new Date()});

    readingIds = await cascadeReadingsBy(txn, "meter_group_id", meterGroupId, "soft-delete");
    billingIds = await cascadeBillingsByReadingIds(txn, readingIds, "soft-delete");
  });

  await refreshCaches("meter-groups", meterGroupId, readingIds, billingIds, ["meter-groups", "readings", "billings"]);

  return {primary: 1, readings: readingIds.length, billings: billingIds.length};
}

/**
 * Archive a reading and all its billings (cascading soft-delete).
 * Finds billings where this reading is either previous_reading_id or current_reading_id.
 * Uses a transaction for atomicity.
 */
export async function cascadeDeleteReading(readingId: string): Promise<CascadeDeleteSummary> {
  let billingIds: string[] = [];

  await firestore.runTransaction(async (txn) => {
    const readingRef = firestore.collection(COLLECTIONS.READINGS).doc(readingId);
    const readingSnap = await txn.get(readingRef);
    assertExists(readingSnap, "Reading");
    txn.update(readingRef, {is_deleted: true, deleted_at: new Date()});

    const readingData = readingSnap.data()!;
    releaseReadingLock(txn, readingData.meter_group_id, readingData.property_id, readingData.reading_date);

    billingIds = await cascadeBillingsByReadingIds(txn, [readingId], "soft-delete");
  });

  await refreshCaches("readings", readingId, [], billingIds, ["readings", "billings"]);

  return {primary: 1, billings: billingIds.length};
}

/**
 * Permanently delete an already-archived property and its already-archived
 * readings + billings. Requires the property to be soft-deleted first (409
 * otherwise) — mirrors cascadeDeleteProperty's blast radius but only ever
 * touches records that are already archived, so a purge can't reach into
 * still-active data.
 */
export async function cascadePurgeProperty(propertyId: string): Promise<CascadeDeleteSummary> {
  let readingIds: string[] = [];
  let billingIds: string[] = [];

  await firestore.runTransaction(async (txn) => {
    const propertyRef = firestore.collection(COLLECTIONS.PROPERTIES).doc(propertyId);
    assertArchivedForPurge(await txn.get(propertyRef), "Property");
    txn.delete(propertyRef);

    readingIds = await cascadeReadingsBy(txn, "property_id", propertyId, "purge");
    billingIds = await cascadeBillingsByPropertyId(txn, propertyId, "purge");
  });

  await cacheDel(`utilitool:properties:id:${propertyId}`);
  await Promise.all(readingIds.map((id) => cacheDel(`utilitool:readings:id:${id}`)));
  await Promise.all(billingIds.map((id) => cacheDel(`utilitool:billings:id:${id}`)));

  return {primary: 1, readings: readingIds.length, billings: billingIds.length};
}

/**
 * Permanently delete an already-archived meter group and its already-archived
 * readings + billings. Requires the meter group to be soft-deleted first (409
 * otherwise).
 */
export async function cascadePurgeMeterGroup(meterGroupId: string): Promise<CascadeDeleteSummary> {
  let readingIds: string[] = [];
  let billingIds: string[] = [];

  await firestore.runTransaction(async (txn) => {
    const meterGroupRef = firestore.collection(COLLECTIONS.METER_GROUPS).doc(meterGroupId);
    assertArchivedForPurge(await txn.get(meterGroupRef), "Meter group");
    txn.delete(meterGroupRef);

    readingIds = await cascadeReadingsBy(txn, "meter_group_id", meterGroupId, "purge");
    billingIds = await cascadeBillingsByReadingIds(txn, readingIds, "purge");
  });

  await cacheDel(`utilitool:meter-groups:id:${meterGroupId}`);
  await Promise.all(readingIds.map((id) => cacheDel(`utilitool:readings:id:${id}`)));
  await Promise.all(billingIds.map((id) => cacheDel(`utilitool:billings:id:${id}`)));

  return {primary: 1, readings: readingIds.length, billings: billingIds.length};
}

/**
 * Permanently delete an already-archived reading and its already-archived
 * billings. Requires the reading to be soft-deleted first (409 otherwise).
 */
export async function cascadePurgeReading(readingId: string): Promise<CascadeDeleteSummary> {
  let billingIds: string[] = [];

  await firestore.runTransaction(async (txn) => {
    const readingRef = firestore.collection(COLLECTIONS.READINGS).doc(readingId);
    assertArchivedForPurge(await txn.get(readingRef), "Reading");
    txn.delete(readingRef);

    billingIds = await cascadeBillingsByReadingIds(txn, [readingId], "purge");
  });

  await cacheDel(`utilitool:readings:id:${readingId}`);
  await Promise.all(billingIds.map((id) => cacheDel(`utilitool:billings:id:${id}`)));

  return {primary: 1, billings: billingIds.length};
}

/**
 * Restore a property and all its soft-deleted readings + billings.
 * Uses a transaction for atomicity.
 */
export async function cascadeRestoreProperty(propertyId: string): Promise<CascadeDeleteSummary> {
  let readingIds: string[] = [];
  let billingIds: string[] = [];

  await runCascadeTransaction(async (txn) => {
    const propertyRef = firestore.collection(COLLECTIONS.PROPERTIES).doc(propertyId);
    assertExists(await txn.get(propertyRef), "Property");
    txn.update(propertyRef, {is_deleted: false, deleted_at: null});

    readingIds = await cascadeReadingsBy(txn, "property_id", propertyId, "restore");
    billingIds = await cascadeBillingsByPropertyId(txn, propertyId, "restore");
  });

  await refreshCaches("properties", propertyId, readingIds, billingIds, ["properties", "readings", "billings"]);

  return {primary: 1, readings: readingIds.length, billings: billingIds.length};
}

/**
 * Restore a meter group and all its soft-deleted readings + billings.
 * Uses a transaction for atomicity.
 */
export async function cascadeRestoreMeterGroup(meterGroupId: string): Promise<CascadeDeleteSummary> {
  let readingIds: string[] = [];
  let billingIds: string[] = [];

  await runCascadeTransaction(async (txn) => {
    const meterGroupRef = firestore.collection(COLLECTIONS.METER_GROUPS).doc(meterGroupId);
    assertExists(await txn.get(meterGroupRef), "Meter group");
    txn.update(meterGroupRef, {is_deleted: false, deleted_at: null});

    readingIds = await cascadeReadingsBy(txn, "meter_group_id", meterGroupId, "restore");
    billingIds = await cascadeBillingsByReadingIds(txn, readingIds, "restore");
  });

  await refreshCaches("meter-groups", meterGroupId, readingIds, billingIds, ["meter-groups", "readings", "billings"]);

  return {primary: 1, readings: readingIds.length, billings: billingIds.length};
}

/**
 * Restore a reading and all its soft-deleted billings.
 * Uses a transaction for atomicity.
 */
export async function cascadeRestoreReading(readingId: string): Promise<CascadeDeleteSummary> {
  let billingIds: string[] = [];

  await runCascadeTransaction(async (txn) => {
    const readingRef = firestore.collection(COLLECTIONS.READINGS).doc(readingId);
    const readingSnap = await txn.get(readingRef);
    assertExists(readingSnap, "Reading");
    txn.update(readingRef, {is_deleted: false, deleted_at: null});

    const readingData = readingSnap.data()!;
    reclaimReadingLock(txn, readingData.meter_group_id, readingData.property_id, readingData.reading_date);

    billingIds = await cascadeBillingsByReadingIds(txn, [readingId], "restore");
  });

  await refreshCaches("readings", readingId, [], billingIds, ["readings", "billings"]);

  return {primary: 1, billings: billingIds.length};
}
