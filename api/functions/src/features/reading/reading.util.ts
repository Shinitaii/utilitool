import {Timestamp, FieldValue} from "firebase-admin/firestore";
import {AppError} from "../../utils/error.util";
import {firestore} from "../../config/firebase.config";
import {COLLECTIONS} from "../../constants/collection.constants";
import {snapshotToModel} from "../../utils/firestore.util";
import {cacheSet} from "../../utils/cache.util";
import {listAppend} from "../../utils/list-cache.util";
import {billingService} from "../billing/billing.service";
import {billingRepository} from "../billing/billing.repository";
import {readingRepository} from "./reading.repository";
import {CachedRepository} from "../../lib/cached-repository.lib";
import type {CreateReadingDTO} from "./reading.dto";
import type {Reading} from "./reading.model";

const CACHE_TTL = 10 * 60; // 10 minutes
type ReadingCreatePayload = CreateReadingDTO & { meter_version: number };

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

/**
 * Compute the start (inclusive) / end (exclusive) of the calendar month
 * immediately preceding the supplied reading_date, in Asia/Manila timezone.
 */
export function getPreviousMonthWindow(readingDate: Timestamp): { start: Timestamp; end: Timestamp } {
  const manilaMs = readingDate.toMillis() + MANILA_OFFSET_MS;
  const manilaDate = new Date(manilaMs);
  const year = manilaDate.getUTCFullYear();
  const month = manilaDate.getUTCMonth(); // 0-indexed, this is current month in Manila

  const prevMonth = month === 0 ? 11 : month - 1;
  const prevYear = month === 0 ? year - 1 : year;

  const startManilaMs = Date.UTC(prevYear, prevMonth, 1) - MANILA_OFFSET_MS;
  const endManilaMs = Date.UTC(year, month, 1) - MANILA_OFFSET_MS;

  return {
    start: Timestamp.fromMillis(startManilaMs),
    end: Timestamp.fromMillis(endManilaMs),
  };
}

/**
 * Find the most recent reading for a specific property within a meter group
 * in the previous calendar month (Asia/Manila).
 * Returns {id, data} or null if none exists.
 */
export async function findPreviousMonthReading(
  meterGroupId: string,
  propertyId: string,
  readingDate: Timestamp
): Promise<{id: string; data: any} | null> {
  const prevWindow = getPreviousMonthWindow(readingDate);
  const prevReadingSnap = await firestore
    .collection(COLLECTIONS.READINGS)
    .where("meter_group_id", "==", meterGroupId)
    .where("property_id", "==", propertyId)
    .where("is_deleted", "==", false)
    .where("reading_date", ">=", prevWindow.start)
    .where("reading_date", "<", prevWindow.end)
    .orderBy("reading_date", "desc")
    .limit(1)
    .get();

  if (prevReadingSnap.empty) return null;

  const doc = prevReadingSnap.docs[0];
  return {
    id: doc.id,
    data: doc.data(),
  };
}

/**
 * Validate that current reading is greater than previous reading.
 * Meter rollback is only enforced when both readings have the same meter version.
 * If versions differ, the readings are from different meter cycles and comparison is skipped.
 */
export function validateMeterRollback(
  prevReadingAmount: number,
  prevMeterVersion: number,
  currReadingAmount: number,
  currMeterVersion: number
): void {
  if (currMeterVersion === prevMeterVersion && currReadingAmount <= prevReadingAmount) {
    throw new AppError(
      400,
      "Current reading must be greater than previous reading (meter rollback not allowed)"
    );
  }
}

/**
 * Create a single reading with optional auto-billing in a Firestore transaction.
 * If a previous-month reading exists for the same meter group + property,
 * atomically creates the reading + one Billing document.
 * Otherwise, creates the reading only.
 */
export async function createReadingWithAutoBilling(
  userId: string,
  data: CreateReadingDTO,
  meterVersion: number,
): Promise<Reading> {
  const cachedRepo = new CachedRepository(readingRepository, userId, "readings", CACHE_TTL);

  // Look up the previous-month reading for the same meter_group + property.
  const prevReading = await findPreviousMonthReading(data.meter_group_id, data.property_id, data.reading_date);

  // First-time scenario: no previous-month reading. Fall back to a plain create — no billings.
  if (!prevReading) {
    const payload: ReadingCreatePayload = {...data, meter_version: meterVersion};
    return cachedRepo.create(payload);
  }

  const prevReadingId = prevReading.id;
  const prevReadingData = prevReading.data;

  // Get the specific property for this reading
  const propertySnap = await firestore
    .collection(COLLECTIONS.PROPERTIES)
    .doc(data.property_id)
    .get();

  if (!propertySnap.exists || propertySnap.data()?.is_deleted) {
    const payload: ReadingCreatePayload = {...data, meter_version: meterVersion};
    return cachedRepo.create(payload);
  }

  const properties = [propertySnap];

  // Build the new reading document up front so we can use it inside the txn.
  const newReadingRef = firestore.collection(COLLECTIONS.READINGS).doc();
  const newReadingId = newReadingRef.id;
  const newReadingData = {
    ...data,
    meter_version: meterVersion,
    created_at: FieldValue.serverTimestamp(),
    is_deleted: false,
    deleted_at: null,
  };

  // Data passed to billingService.createFromReadings is the in-memory shape
  // used for comparisons (meter_group_id, reading_amount, meter_version). The
  // serverTimestamp sentinel isn't read by that method.
  const newReadingForBilling = {
    meter_group_id: data.meter_group_id,
    reading_amount: data.reading_amount,
    reading_date: data.reading_date,
    meter_version: meterVersion,
  };

  const billingIds: string[] = [];
  await firestore.runTransaction(async (txn) => {
    txn.set(newReadingRef, newReadingData);
    for (const propertyDoc of properties) {
      const billingId = billingService.createFromReadings(
        txn,
        propertyDoc.id,
        prevReadingId,
        newReadingId,
        prevReadingData,
        newReadingForBilling,
      );
      billingIds.push(billingId);
    }
  });

  const snap = await newReadingRef.get();
  const reading = snapshotToModel<Reading>(snap);
  await cacheSet(`utilitool:readings:id:${reading.id}`, reading, CACHE_TTL);
  await listAppend(`utilitool:readings:all:${userId}`, reading);

  // Cache auto-created billings
  for (const billingId of billingIds) {
    const billing = await billingRepository.getById(billingId);
    if (billing) {
      await cacheSet(`utilitool:billings:id:${billing.id}`, billing, 10 * 60);
      await listAppend(`utilitool:billings:all:${userId}`, billing);
    }
  }

  return reading;
}

/**
 * Create multiple readings with optional auto-billing for each.
 * For each reading, if a previous-month reading exists, creates
 * the reading + Billing atomically in a transaction.
 * Parallelizes across readings.
 */
export async function createBatchReadingsWithAutoBilling(
  userId: string,
  readingsWithVersion: ReadingCreatePayload[],
): Promise<Reading[]> {
  const cachedRepo = new CachedRepository(readingRepository, userId, "readings", CACHE_TTL);

  const readingPromises = readingsWithVersion.map(async (readingData) => {
    // Look for previous-month reading scoped to this property
    const prevReading = await findPreviousMonthReading(readingData.meter_group_id, readingData.property_id, readingData.reading_date);

    // If no previous reading, just create the reading
    if (!prevReading) {
      return cachedRepo.create(readingData);
    }

    // Previous reading exists; create reading + billing in transaction
    const prevReadingId = prevReading.id;
    const prevReadingData = prevReading.data;

    const newReadingRef = firestore.collection(COLLECTIONS.READINGS).doc();
    const newReadingId = newReadingRef.id;
    const newReadingDoc = {
      ...readingData,
      created_at: FieldValue.serverTimestamp(),
      is_deleted: false,
      deleted_at: null,
    };

    const newReadingForBilling = {
      meter_group_id: readingData.meter_group_id,
      reading_amount: readingData.reading_amount,
      reading_date: readingData.reading_date,
      meter_version: readingData.meter_version,
    };

    let billingId: string | undefined;
    await firestore.runTransaction(async (txn) => {
      txn.set(newReadingRef, newReadingDoc);
      billingId = billingService.createFromReadings(
        txn,
        readingData.property_id,
        prevReadingId,
        newReadingId,
        prevReadingData,
        newReadingForBilling,
      );
    });

    const snap = await newReadingRef.get();
    const reading = snapshotToModel<Reading>(snap);
    await cacheSet(`utilitool:readings:id:${reading.id}`, reading, CACHE_TTL);
    await listAppend(`utilitool:readings:all:${userId}`, reading);

    // Cache auto-created billing
    if (billingId) {
      const billing = await billingRepository.getById(billingId);
      if (billing) {
        await cacheSet(`utilitool:billings:id:${billing.id}`, billing, 10 * 60);
        await listAppend(`utilitool:billings:all:${userId}`, billing);
      }
    }

    return reading;
  });

  return Promise.all(readingPromises);
}
