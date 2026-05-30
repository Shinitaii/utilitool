import {firestore} from "../config/firebase.config";
import {COLLECTIONS} from "../constants/collection.constants";
import {collectionRef} from "../lib/firestore.lib";
import {cacheDel} from "./cache.util";

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

    // Soft-delete all readings
    for (const readingId of foundReadingIds) {
      const readingRef = firestore.collection(COLLECTIONS.READINGS).doc(readingId);
      txn.update(readingRef, {is_deleted: true, deleted_at: new Date()});
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

  // Clear caches after txn commits
  await cacheDel(`utilitool:properties:id:${propertyId}`);
  for (const readingId of readingIds) {
    await cacheDel(`utilitool:readings:id:${readingId}`);
  }
  for (const billingId of billingIds) {
    await cacheDel(`utilitool:billings:id:${billingId}`);
  }

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

    // Soft-delete all readings
    for (const readingId of foundReadingIds) {
      const readingRef = firestore.collection(COLLECTIONS.READINGS).doc(readingId);
      txn.update(readingRef, {is_deleted: true, deleted_at: new Date()});
    }

    // Find all billings that reference these readings
    if (foundReadingIds.length > 0) {
      const billingsSnap = await collectionRef(COLLECTIONS.BILLINGS)
        .where("is_deleted", "==", false)
        .get();

      const billingsToDelete = billingsSnap.docs.filter((doc) => {
        const billing = doc.data();
        return (
          foundReadingIds.includes(billing.previous_reading_id) ||
          foundReadingIds.includes(billing.current_reading_id)
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

  // Clear caches after txn commits
  await cacheDel(`utilitool:meter-groups:id:${meterGroupId}`);
  for (const readingId of readingIds) {
    await cacheDel(`utilitool:readings:id:${readingId}`);
  }
  for (const billingId of billingIds) {
    await cacheDel(`utilitool:billings:id:${billingId}`);
  }

  return summary;
}

/**
 * Archive a reading and all its billings (cascading soft-delete).
 * Finds billings where this reading is either previous_reading_id or current_reading_id.
 * Uses a transaction for atomicity.
 */
export async function cascadeDeleteReading(readingId: string): Promise<CascadeDeleteSummary> {
  const summary: CascadeDeleteSummary = {primary: 1, billings: 0};

  await firestore.runTransaction(async (txn) => {
    const readingRef = firestore.collection(COLLECTIONS.READINGS).doc(readingId);
    const readingSnap = await txn.get(readingRef);

    if (!readingSnap.exists) {
      throw new Error("Reading not found");
    }

    // Soft-delete reading
    txn.update(readingRef, {is_deleted: true, deleted_at: new Date()});

    // Find all billings that reference this reading
    const billingsSnap = await collectionRef(COLLECTIONS.BILLINGS)
      .where("is_deleted", "==", false)
      .get();

    const billingsToDelete = billingsSnap.docs.filter((doc) => {
      const billing = doc.data();
      return billing.previous_reading_id === readingId || billing.current_reading_id === readingId;
    });

    summary.billings = billingsToDelete.length;

    // Soft-delete all related billings
    for (const billingDoc of billingsToDelete) {
      txn.update(billingDoc.ref, {is_deleted: true, deleted_at: new Date()});
    }
  });

  return summary;
}

/**
 * Restore a property and all its soft-deleted readings + billings.
 * Uses a transaction for atomicity.
 */
export async function cascadeRestoreProperty(propertyId: string): Promise<CascadeDeleteSummary> {
  const summary: CascadeDeleteSummary = {primary: 1, readings: 0, billings: 0};

  await firestore.runTransaction(async (txn) => {
    const propertyRef = firestore.collection(COLLECTIONS.PROPERTIES).doc(propertyId);
    const propertySnap = await txn.get(propertyRef);

    if (!propertySnap.exists) {
      throw new Error("Property not found");
    }

    // Restore property
    txn.update(propertyRef, {is_deleted: false, deleted_at: null});

    // Find all soft-deleted readings for this property
    const readingsSnap = await collectionRef(COLLECTIONS.READINGS)
      .where("property_id", "==", propertyId)
      .where("is_deleted", "==", true)
      .get();

    const readingIds = readingsSnap.docs.map((doc) => doc.id);
    summary.readings = readingIds.length;

    // Restore all readings
    for (const readingId of readingIds) {
      const readingRef = firestore.collection(COLLECTIONS.READINGS).doc(readingId);
      txn.update(readingRef, {is_deleted: false, deleted_at: null});
    }

    // Find all soft-deleted billings for this property
    const billingsSnap = await collectionRef(COLLECTIONS.BILLINGS)
      .where("property_id", "==", propertyId)
      .where("is_deleted", "==", true)
      .get();

    summary.billings = billingsSnap.size;

    // Restore all billings
    for (const billingDoc of billingsSnap.docs) {
      txn.update(billingDoc.ref, {is_deleted: false, deleted_at: null});
    }
  });

  return summary;
}

/**
 * Restore a meter group and all its soft-deleted readings + billings.
 * Uses a transaction for atomicity.
 */
export async function cascadeRestoreMeterGroup(meterGroupId: string): Promise<CascadeDeleteSummary> {
  const summary: CascadeDeleteSummary = {primary: 1, readings: 0, billings: 0};

  await firestore.runTransaction(async (txn) => {
    const meterGroupRef = firestore.collection(COLLECTIONS.METER_GROUPS).doc(meterGroupId);
    const meterGroupSnap = await txn.get(meterGroupRef);

    if (!meterGroupSnap.exists) {
      throw new Error("Meter group not found");
    }

    // Restore meter group
    txn.update(meterGroupRef, {is_deleted: false, deleted_at: null});

    // Find all soft-deleted readings for this meter group
    const readingsSnap = await collectionRef(COLLECTIONS.READINGS)
      .where("meter_group_id", "==", meterGroupId)
      .where("is_deleted", "==", true)
      .get();

    const readingIds = readingsSnap.docs.map((doc) => doc.id);
    summary.readings = readingIds.length;

    // Restore all readings
    for (const readingId of readingIds) {
      const readingRef = firestore.collection(COLLECTIONS.READINGS).doc(readingId);
      txn.update(readingRef, {is_deleted: false, deleted_at: null});
    }

    // Find all soft-deleted billings that reference these readings
    if (readingIds.length > 0) {
      const billingsSnap = await collectionRef(COLLECTIONS.BILLINGS)
        .where("is_deleted", "==", true)
        .get();

      const billingsToRestore = billingsSnap.docs.filter((doc) => {
        const billing = doc.data();
        return (
          readingIds.includes(billing.previous_reading_id) ||
          readingIds.includes(billing.current_reading_id)
        );
      });

      summary.billings = billingsToRestore.length;

      // Restore all related billings
      for (const billingDoc of billingsToRestore) {
        txn.update(billingDoc.ref, {is_deleted: false, deleted_at: null});
      }
    }
  });

  return summary;
}

/**
 * Restore a reading and all its soft-deleted billings.
 * Uses a transaction for atomicity.
 */
export async function cascadeRestoreReading(readingId: string): Promise<CascadeDeleteSummary> {
  const summary: CascadeDeleteSummary = {primary: 1, billings: 0};

  await firestore.runTransaction(async (txn) => {
    const readingRef = firestore.collection(COLLECTIONS.READINGS).doc(readingId);
    const readingSnap = await txn.get(readingRef);

    if (!readingSnap.exists) {
      throw new Error("Reading not found");
    }

    // Restore reading
    txn.update(readingRef, {is_deleted: false, deleted_at: null});

    // Find all soft-deleted billings that reference this reading
    const billingsSnap = await collectionRef(COLLECTIONS.BILLINGS)
      .where("is_deleted", "==", true)
      .get();

    const billingsToRestore = billingsSnap.docs.filter((doc) => {
      const billing = doc.data();
      return billing.previous_reading_id === readingId || billing.current_reading_id === readingId;
    });

    summary.billings = billingsToRestore.length;

    // Restore all related billings
    for (const billingDoc of billingsToRestore) {
      txn.update(billingDoc.ref, {is_deleted: false, deleted_at: null});
    }
  });

  return summary;
}
