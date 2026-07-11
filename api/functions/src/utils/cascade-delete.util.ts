import {FieldValue, Timestamp} from "firebase-admin/firestore";
import {firestore} from "../config/firebase.config";
import {COLLECTIONS} from "../constants/collection.constants";
import {collectionRef} from "../lib/firestore.lib";
import {cacheDel, cacheDelPattern} from "./cache.util";
import {AppError} from "./error.util";
import {readingLockId, isAlreadyExistsError} from "../features/reading/reading.util";

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
  const summary: CascadeDeleteSummary = {primary: 1, readings: 0, billings: 0};
  const readingIds: string[] = [];
  const billingIds: string[] = [];

  await firestore.runTransaction(async (txn) => {
    const propertyRef = firestore.collection(COLLECTIONS.PROPERTIES).doc(propertyId);
    const propertySnap = await txn.get(propertyRef);

    if (!propertySnap.exists) {
      throw new Error("Property not found");
    }

    // Soft-delete property
    txn.update(propertyRef, {is_deleted: true, deleted_at: new Date()});

    // Find all readings for this property
    const readingsSnap = await collectionRef(COLLECTIONS.READINGS)
      .where("property_id", "==", propertyId)
      .where("is_deleted", "==", false)
      .get();

    const foundReadingIds = readingsSnap.docs.map((doc) => doc.id);
    readingIds.push(...foundReadingIds);
    summary.readings = foundReadingIds.length;

    // Soft-delete all readings + release their month locks
    for (const readingDoc of readingsSnap.docs) {
      txn.update(readingDoc.ref, {is_deleted: true, deleted_at: new Date()});
      const readingData = readingDoc.data();
      releaseReadingLock(txn, readingData.meter_group_id, propertyId, readingData.reading_date);
    }

    // Find all billings for this property
    const billingsSnap = await collectionRef(COLLECTIONS.BILLINGS)
      .where("property_id", "==", propertyId)
      .where("is_deleted", "==", false)
      .get();

    const foundBillingIds = billingsSnap.docs.map((doc) => doc.id);
    billingIds.push(...foundBillingIds);
    summary.billings = foundBillingIds.length;

    // Soft-delete all billings
    for (const billingDoc of billingsSnap.docs) {
      txn.update(billingDoc.ref, {is_deleted: true, deleted_at: new Date()});
    }
  });

  // Clear id caches after txn commits
  await cacheDel(`utilitool:properties:id:${propertyId}`);
  await Promise.all(readingIds.map((readingId) => cacheDel(`utilitool:readings:id:${readingId}`)));
  await Promise.all(billingIds.map((billingId) => cacheDel(`utilitool:billings:id:${billingId}`)));

  // Clear list caches so cascaded readings/billings stop appearing in active lists
  await invalidateListCaches(["properties", "readings", "billings"]);

  return summary;
}

/**
 * Archive a meter group and all its readings + billings (cascading soft-delete).
 * Readings are filtered by meter_group_id, and billings by those reading IDs.
 * Uses a transaction for atomicity.
 */
export async function cascadeDeleteMeterGroup(meterGroupId: string): Promise<CascadeDeleteSummary> {
  const summary: CascadeDeleteSummary = {primary: 1, readings: 0, billings: 0};
  const readingIds: string[] = [];
  const billingIds: string[] = [];

  await firestore.runTransaction(async (txn) => {
    const meterGroupRef = firestore.collection(COLLECTIONS.METER_GROUPS).doc(meterGroupId);
    const meterGroupSnap = await txn.get(meterGroupRef);

    if (!meterGroupSnap.exists) {
      throw new Error("Meter group not found");
    }

    // Soft-delete meter group
    txn.update(meterGroupRef, {is_deleted: true, deleted_at: new Date()});

    // Find all readings for this meter group
    const readingsSnap = await collectionRef(COLLECTIONS.READINGS)
      .where("meter_group_id", "==", meterGroupId)
      .where("is_deleted", "==", false)
      .get();

    const foundReadingIds = readingsSnap.docs.map((doc) => doc.id);
    readingIds.push(...foundReadingIds);
    summary.readings = foundReadingIds.length;

    // Soft-delete all readings + release their month locks
    for (const readingDoc of readingsSnap.docs) {
      txn.update(readingDoc.ref, {is_deleted: true, deleted_at: new Date()});
      const readingData = readingDoc.data();
      releaseReadingLock(txn, meterGroupId, readingData.property_id, readingData.reading_date);
    }

    // Find all billings that reference these readings
    if (foundReadingIds.length > 0) {
      const billingsSnap = await collectionRef(COLLECTIONS.BILLINGS)
        .where("is_deleted", "==", false)
        .get();

      const foundReadingIdSet = new Set(foundReadingIds);
      const billingsToDelete = billingsSnap.docs.filter((doc) => {
        const billing = doc.data();
        return (
          foundReadingIdSet.has(billing.previous_reading_id) ||
          foundReadingIdSet.has(billing.current_reading_id)
        );
      });

      const foundBillingIds = billingsToDelete.map((doc) => doc.id);
      billingIds.push(...foundBillingIds);
      summary.billings = billingsToDelete.length;

      // Soft-delete all related billings
      for (const billingDoc of billingsToDelete) {
        txn.update(billingDoc.ref, {is_deleted: true, deleted_at: new Date()});
      }
    }
  });

  // Clear id caches after txn commits
  await cacheDel(`utilitool:meter-groups:id:${meterGroupId}`);
  await Promise.all(readingIds.map((readingId) => cacheDel(`utilitool:readings:id:${readingId}`)));
  await Promise.all(billingIds.map((billingId) => cacheDel(`utilitool:billings:id:${billingId}`)));

  // Clear list caches so cascaded readings/billings stop appearing in active lists
  await invalidateListCaches(["meter-groups", "readings", "billings"]);

  return summary;
}

/**
 * Archive a reading and all its billings (cascading soft-delete).
 * Finds billings where this reading is either previous_reading_id or current_reading_id.
 * Uses a transaction for atomicity.
 */
export async function cascadeDeleteReading(readingId: string): Promise<CascadeDeleteSummary> {
  const summary: CascadeDeleteSummary = {primary: 1, billings: 0};
  const billingIds: string[] = [];

  await firestore.runTransaction(async (txn) => {
    const readingRef = firestore.collection(COLLECTIONS.READINGS).doc(readingId);
    const readingSnap = await txn.get(readingRef);

    if (!readingSnap.exists) {
      throw new Error("Reading not found");
    }

    // Soft-delete reading
    txn.update(readingRef, {is_deleted: true, deleted_at: new Date()});

    const readingData = readingSnap.data()!;
    releaseReadingLock(txn, readingData.meter_group_id, readingData.property_id, readingData.reading_date);

    // Find all billings that reference this reading
    const billingsSnap = await collectionRef(COLLECTIONS.BILLINGS)
      .where("is_deleted", "==", false)
      .get();

    const billingsToDelete = billingsSnap.docs.filter((doc) => {
      const billing = doc.data();
      return billing.previous_reading_id === readingId || billing.current_reading_id === readingId;
    });

    billingIds.push(...billingsToDelete.map((doc) => doc.id));
    summary.billings = billingsToDelete.length;

    // Soft-delete all related billings
    for (const billingDoc of billingsToDelete) {
      txn.update(billingDoc.ref, {is_deleted: true, deleted_at: new Date()});
    }
  });

  // Clear id caches after txn commits
  await cacheDel(`utilitool:readings:id:${readingId}`);
  await Promise.all(billingIds.map((billingId) => cacheDel(`utilitool:billings:id:${billingId}`)));

  // Clear list caches so cascaded billings stop appearing in active lists
  await invalidateListCaches(["readings", "billings"]);

  return summary;
}

/**
 * Permanently delete an already-archived property and its already-archived
 * readings + billings. Requires the property to be soft-deleted first (409
 * otherwise) — mirrors cascadeDeleteProperty's blast radius but only ever
 * touches records that are already archived, so a purge can't reach into
 * still-active data.
 */
export async function cascadePurgeProperty(propertyId: string): Promise<CascadeDeleteSummary> {
  const summary: CascadeDeleteSummary = {primary: 1, readings: 0, billings: 0};
  const readingIds: string[] = [];
  const billingIds: string[] = [];

  await firestore.runTransaction(async (txn) => {
    const propertyRef = firestore.collection(COLLECTIONS.PROPERTIES).doc(propertyId);
    const propertySnap = await txn.get(propertyRef);

    if (!propertySnap.exists) {
      throw new AppError(404, "Property not found");
    }
    if (propertySnap.data()?.is_deleted !== true) {
      throw new AppError(409, "Cannot permanently delete an active property. Archive it first.");
    }

    txn.delete(propertyRef);

    const readingsSnap = await collectionRef(COLLECTIONS.READINGS)
      .where("property_id", "==", propertyId)
      .where("is_deleted", "==", true)
      .get();

    const foundReadingIds = readingsSnap.docs.map((doc) => doc.id);
    readingIds.push(...foundReadingIds);
    summary.readings = foundReadingIds.length;
    readingsSnap.docs.forEach((doc) => txn.delete(doc.ref));

    const billingsSnap = await collectionRef(COLLECTIONS.BILLINGS)
      .where("property_id", "==", propertyId)
      .where("is_deleted", "==", true)
      .get();

    const foundBillingIds = billingsSnap.docs.map((doc) => doc.id);
    billingIds.push(...foundBillingIds);
    summary.billings = foundBillingIds.length;
    billingsSnap.docs.forEach((doc) => txn.delete(doc.ref));
  });

  await cacheDel(`utilitool:properties:id:${propertyId}`);
  await Promise.all(readingIds.map((readingId) => cacheDel(`utilitool:readings:id:${readingId}`)));
  await Promise.all(billingIds.map((billingId) => cacheDel(`utilitool:billings:id:${billingId}`)));

  return summary;
}

/**
 * Permanently delete an already-archived meter group and its already-archived
 * readings + billings. Requires the meter group to be soft-deleted first (409
 * otherwise).
 */
export async function cascadePurgeMeterGroup(meterGroupId: string): Promise<CascadeDeleteSummary> {
  const summary: CascadeDeleteSummary = {primary: 1, readings: 0, billings: 0};
  const readingIds: string[] = [];
  const billingIds: string[] = [];

  await firestore.runTransaction(async (txn) => {
    const meterGroupRef = firestore.collection(COLLECTIONS.METER_GROUPS).doc(meterGroupId);
    const meterGroupSnap = await txn.get(meterGroupRef);

    if (!meterGroupSnap.exists) {
      throw new AppError(404, "Meter group not found");
    }
    if (meterGroupSnap.data()?.is_deleted !== true) {
      throw new AppError(409, "Cannot permanently delete an active meter group. Archive it first.");
    }

    txn.delete(meterGroupRef);

    const readingsSnap = await collectionRef(COLLECTIONS.READINGS)
      .where("meter_group_id", "==", meterGroupId)
      .where("is_deleted", "==", true)
      .get();

    const foundReadingIds = readingsSnap.docs.map((doc) => doc.id);
    readingIds.push(...foundReadingIds);
    summary.readings = foundReadingIds.length;
    readingsSnap.docs.forEach((doc) => txn.delete(doc.ref));

    if (foundReadingIds.length > 0) {
      const billingsSnap = await collectionRef(COLLECTIONS.BILLINGS)
        .where("is_deleted", "==", true)
        .get();

      const foundReadingIdSet = new Set(foundReadingIds);
      const billingsToPurge = billingsSnap.docs.filter((doc) => {
        const billing = doc.data();
        return (
          foundReadingIdSet.has(billing.previous_reading_id) ||
          foundReadingIdSet.has(billing.current_reading_id)
        );
      });

      const foundBillingIds = billingsToPurge.map((doc) => doc.id);
      billingIds.push(...foundBillingIds);
      summary.billings = billingsToPurge.length;
      billingsToPurge.forEach((doc) => txn.delete(doc.ref));
    }
  });

  await cacheDel(`utilitool:meter-groups:id:${meterGroupId}`);
  await Promise.all(readingIds.map((readingId) => cacheDel(`utilitool:readings:id:${readingId}`)));
  await Promise.all(billingIds.map((billingId) => cacheDel(`utilitool:billings:id:${billingId}`)));

  return summary;
}

/**
 * Permanently delete an already-archived reading and its already-archived
 * billings. Requires the reading to be soft-deleted first (409 otherwise).
 */
export async function cascadePurgeReading(readingId: string): Promise<CascadeDeleteSummary> {
  const summary: CascadeDeleteSummary = {primary: 1, billings: 0};
  const billingIds: string[] = [];

  await firestore.runTransaction(async (txn) => {
    const readingRef = firestore.collection(COLLECTIONS.READINGS).doc(readingId);
    const readingSnap = await txn.get(readingRef);

    if (!readingSnap.exists) {
      throw new AppError(404, "Reading not found");
    }
    if (readingSnap.data()?.is_deleted !== true) {
      throw new AppError(409, "Cannot permanently delete an active reading. Archive it first.");
    }

    txn.delete(readingRef);

    const billingsSnap = await collectionRef(COLLECTIONS.BILLINGS)
      .where("is_deleted", "==", true)
      .get();

    const billingsToPurge = billingsSnap.docs.filter((doc) => {
      const billing = doc.data();
      return billing.previous_reading_id === readingId || billing.current_reading_id === readingId;
    });

    billingIds.push(...billingsToPurge.map((doc) => doc.id));
    summary.billings = billingsToPurge.length;
    billingsToPurge.forEach((doc) => txn.delete(doc.ref));
  });

  await cacheDel(`utilitool:readings:id:${readingId}`);
  await Promise.all(billingIds.map((billingId) => cacheDel(`utilitool:billings:id:${billingId}`)));

  return summary;
}

/**
 * Restore a property and all its soft-deleted readings + billings.
 * Uses a transaction for atomicity.
 */
export async function cascadeRestoreProperty(propertyId: string): Promise<CascadeDeleteSummary> {
  const summary: CascadeDeleteSummary = {primary: 1, readings: 0, billings: 0};
  const readingIds: string[] = [];
  const billingIds: string[] = [];

  await runCascadeTransaction(async (txn) => {
    const propertyRef = firestore.collection(COLLECTIONS.PROPERTIES).doc(propertyId);
    const propertySnap = await txn.get(propertyRef);

    if (!propertySnap.exists) {
      throw new AppError(404, "Property not found");
    }

    // Restore property
    txn.update(propertyRef, {is_deleted: false, deleted_at: null});

    // Find all soft-deleted readings for this property
    const readingsSnap = await collectionRef(COLLECTIONS.READINGS)
      .where("property_id", "==", propertyId)
      .where("is_deleted", "==", true)
      .get();

    const foundReadingIds = readingsSnap.docs.map((doc) => doc.id);
    readingIds.push(...foundReadingIds);
    summary.readings = foundReadingIds.length;

    // Restore all readings + reclaim their month locks
    for (const readingDoc of readingsSnap.docs) {
      txn.update(readingDoc.ref, {is_deleted: false, deleted_at: null});
      const readingData = readingDoc.data();
      reclaimReadingLock(txn, readingData.meter_group_id, propertyId, readingData.reading_date);
    }

    // Find all soft-deleted billings for this property
    const billingsSnap = await collectionRef(COLLECTIONS.BILLINGS)
      .where("property_id", "==", propertyId)
      .where("is_deleted", "==", true)
      .get();

    billingIds.push(...billingsSnap.docs.map((doc) => doc.id));
    summary.billings = billingsSnap.size;

    // Restore all billings
    for (const billingDoc of billingsSnap.docs) {
      txn.update(billingDoc.ref, {is_deleted: false, deleted_at: null});
    }
  });

  // Refresh id caches so restored entities aren't served stale (archived) from cache
  await cacheDel(`utilitool:properties:id:${propertyId}`);
  await Promise.all(readingIds.map((readingId) => cacheDel(`utilitool:readings:id:${readingId}`)));
  await Promise.all(billingIds.map((billingId) => cacheDel(`utilitool:billings:id:${billingId}`)));

  // Clear list caches so cascaded readings/billings reappear in active lists
  await invalidateListCaches(["properties", "readings", "billings"]);

  return summary;
}

/**
 * Restore a meter group and all its soft-deleted readings + billings.
 * Uses a transaction for atomicity.
 */
export async function cascadeRestoreMeterGroup(meterGroupId: string): Promise<CascadeDeleteSummary> {
  const summary: CascadeDeleteSummary = {primary: 1, readings: 0, billings: 0};
  const allReadingIds: string[] = [];
  const allBillingIds: string[] = [];

  await runCascadeTransaction(async (txn) => {
    const meterGroupRef = firestore.collection(COLLECTIONS.METER_GROUPS).doc(meterGroupId);
    const meterGroupSnap = await txn.get(meterGroupRef);

    if (!meterGroupSnap.exists) {
      throw new AppError(404, "Meter group not found");
    }

    // Restore meter group
    txn.update(meterGroupRef, {is_deleted: false, deleted_at: null});

    // Find all soft-deleted readings for this meter group
    const readingsSnap = await collectionRef(COLLECTIONS.READINGS)
      .where("meter_group_id", "==", meterGroupId)
      .where("is_deleted", "==", true)
      .get();

    const readingIds = readingsSnap.docs.map((doc) => doc.id);
    allReadingIds.push(...readingIds);
    summary.readings = readingIds.length;

    // Restore all readings + reclaim their month locks
    for (const readingDoc of readingsSnap.docs) {
      txn.update(readingDoc.ref, {is_deleted: false, deleted_at: null});
      const readingData = readingDoc.data();
      reclaimReadingLock(txn, meterGroupId, readingData.property_id, readingData.reading_date);
    }

    // Find all soft-deleted billings that reference these readings
    if (readingIds.length > 0) {
      const billingsSnap = await collectionRef(COLLECTIONS.BILLINGS)
        .where("is_deleted", "==", true)
        .get();

      const readingIdSet = new Set(readingIds);
      const billingsToRestore = billingsSnap.docs.filter((doc) => {
        const billing = doc.data();
        return (
          readingIdSet.has(billing.previous_reading_id) ||
          readingIdSet.has(billing.current_reading_id)
        );
      });

      allBillingIds.push(...billingsToRestore.map((doc) => doc.id));
      summary.billings = billingsToRestore.length;

      // Restore all related billings
      for (const billingDoc of billingsToRestore) {
        txn.update(billingDoc.ref, {is_deleted: false, deleted_at: null});
      }
    }
  });

  // Refresh id caches so restored entities aren't served stale (archived) from cache
  await cacheDel(`utilitool:meter-groups:id:${meterGroupId}`);
  await Promise.all(allReadingIds.map((readingId) => cacheDel(`utilitool:readings:id:${readingId}`)));
  await Promise.all(allBillingIds.map((billingId) => cacheDel(`utilitool:billings:id:${billingId}`)));

  // Clear list caches so cascaded readings/billings reappear in active lists
  await invalidateListCaches(["meter-groups", "readings", "billings"]);

  return summary;
}

/**
 * Restore a reading and all its soft-deleted billings.
 * Uses a transaction for atomicity.
 */
export async function cascadeRestoreReading(readingId: string): Promise<CascadeDeleteSummary> {
  const summary: CascadeDeleteSummary = {primary: 1, billings: 0};
  const billingIds: string[] = [];

  await runCascadeTransaction(async (txn) => {
    const readingRef = firestore.collection(COLLECTIONS.READINGS).doc(readingId);
    const readingSnap = await txn.get(readingRef);

    if (!readingSnap.exists) {
      throw new AppError(404, "Reading not found");
    }

    // Restore reading
    txn.update(readingRef, {is_deleted: false, deleted_at: null});

    const readingData = readingSnap.data()!;
    reclaimReadingLock(txn, readingData.meter_group_id, readingData.property_id, readingData.reading_date);

    // Find all soft-deleted billings that reference this reading
    const billingsSnap = await collectionRef(COLLECTIONS.BILLINGS)
      .where("is_deleted", "==", true)
      .get();

    const billingsToRestore = billingsSnap.docs.filter((doc) => {
      const billing = doc.data();
      return billing.previous_reading_id === readingId || billing.current_reading_id === readingId;
    });

    billingIds.push(...billingsToRestore.map((doc) => doc.id));
    summary.billings = billingsToRestore.length;

    // Restore all related billings
    for (const billingDoc of billingsToRestore) {
      txn.update(billingDoc.ref, {is_deleted: false, deleted_at: null});
    }
  });

  // Refresh id caches so restored entities aren't served stale (archived) from cache
  await cacheDel(`utilitool:readings:id:${readingId}`);
  await Promise.all(billingIds.map((billingId) => cacheDel(`utilitool:billings:id:${billingId}`)));

  // Clear list caches so cascaded billings reappear in active lists
  await invalidateListCaches(["readings", "billings"]);

  return summary;
}
