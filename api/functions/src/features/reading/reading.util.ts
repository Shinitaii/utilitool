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
import type {MeterGroup, MeterGroupVersionEntry} from "../meter-group/meter-group.model";
import type {Property} from "../property/property.model";

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
 * Compute the start (inclusive) / end (exclusive) of the calendar month
 * containing the supplied reading_date, in Asia/Manila timezone.
 */
export function getCurrentMonthWindow(readingDate: Timestamp): { start: Timestamp; end: Timestamp } {
  const manilaMs = readingDate.toMillis() + MANILA_OFFSET_MS;
  const manilaDate = new Date(manilaMs);
  const year = manilaDate.getUTCFullYear();
  const month = manilaDate.getUTCMonth();

  const startManilaMs = Date.UTC(year, month, 1) - MANILA_OFFSET_MS;
  const endManilaMs = Date.UTC(year, month + 1, 1) - MANILA_OFFSET_MS;

  return {
    start: Timestamp.fromMillis(startManilaMs),
    end: Timestamp.fromMillis(endManilaMs),
  };
}

/**
 * Sum the closing (`last_reading`) values of every meter version prior to the
 * supplied version, so readings from different physical-meter cycles can be
 * compared on one continuous scale.
 */
export function getCumulativeOffset(
  versions: Record<string, MeterGroupVersionEntry> | undefined,
  version: number
): number {
  if (!versions) return 0;
  let offset = 0;
  for (let v = 1; v < version; v++) {
    const versionData = versions[String(v)];
    if (versionData) offset += versionData.last_reading;
  }
  return offset;
}

/**
 * Resolve the version-history map that governs a reading's meter_version.
 * Submeter entries on a property track their own versions independently;
 * main meters defer to the meter group's version history.
 */
export function resolveVersionsSource(
  meterGroup: MeterGroup | null | undefined,
  property: Property | null | undefined,
  meterGroupId: string
): Record<string, MeterGroupVersionEntry> | undefined {
  let versionsSource = meterGroup?.versions;
  if (property) {
    const entry = Object.values(property.meter_groups).find((e) => e?.meter_group_id === meterGroupId);
    if (entry && !entry.is_main_meter) {
      versionsSource = entry.versions;
    }
  }
  return versionsSource;
}

/**
 * The reading's value on the continuous, cross-reset scale:
 * cumulative offset of prior versions + the raw reading amount.
 */
export function calculateTrueReading(
  reading: Reading,
  versions: Record<string, MeterGroupVersionEntry> | undefined
): number {
  return getCumulativeOffset(versions, reading.meter_version ?? 1) + reading.reading_amount;
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

export async function findCurrentMonthReading(
  meterGroupId: string,
  propertyId: string,
  readingDate: Timestamp
): Promise<{id: string; data: any} | null> {
  const currentWindow = getCurrentMonthWindow(readingDate);
  const currentReadingSnap = await firestore
    .collection(COLLECTIONS.READINGS)
    .where("meter_group_id", "==", meterGroupId)
    .where("property_id", "==", propertyId)
    .where("is_deleted", "==", false)
    .where("reading_date", ">=", currentWindow.start)
    .where("reading_date", "<", currentWindow.end)
    .orderBy("reading_date", "desc")
    .limit(1)
    .get();

  if (currentReadingSnap.empty) return null;

  const doc = currentReadingSnap.docs[0];
  return {
    id: doc.id,
    data: doc.data(),
  };
}

/**
 * Resolve the meter_version that should be stamped on a new reading for the
 * given property + meter group. Main-meter properties resolve from the meter
 * group's scope (current_version is authoritative there). Submeter properties
 * track their own version independently on their MeterGroupEntry.
 */
export function resolveMeterVersion(
  property: Property | null | undefined,
  meterGroupId: string,
  meterGroup: MeterGroup | null | undefined
): number {
  const entry = property ?
    Object.values(property.meter_groups).find((e) => e.meter_group_id === meterGroupId) :
    undefined;

  if (entry && !entry.is_main_meter) {
    return entry.current_version ?? 1;
  }

  return meterGroup?.current_version ?? 1;
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
 * Deterministic lock document id for "one reading per meter_group+property+month".
 * Created with txn.create() inside the write transaction below: Firestore rejects
 * a create() against an existing document id, so two concurrent requests racing
 * for the same meter_group+property+month can no longer both pass validation and
 * both write — the loser gets a clean 409 instead of a duplicate reading/billing.
 */
export function readingLockId(meterGroupId: string, propertyId: string, readingDate: Timestamp): string {
  const manilaMs = readingDate.toMillis() + MANILA_OFFSET_MS;
  const manilaDate = new Date(manilaMs);
  return `${meterGroupId}_${propertyId}_${manilaDate.getUTCFullYear()}-${manilaDate.getUTCMonth()}`;
}

export function isAlreadyExistsError(err: unknown): boolean {
  const code = (err as {code?: number | string})?.code;
  return code === 6 || code === "already-exists";
}

/**
 * Runs the write side of "create reading + auto-billing" inside a Firestore
 * transaction, once a previous-month reading has been found. The `prevReading`/
 * `property` snapshots are read just before this call (matching the existing
 * flow), so re-validating rollback here only narrows the TOCTOU window rather
 * than closing it outright — the actual guarantee against concurrent duplicate
 * auto-billing comes from `txn.create(lockRef, ...)`: Firestore rejects a
 * create() against an existing document id, so of two concurrent requests
 * racing for the same meter_group+property+month, only one transaction can
 * commit; the other fails with ALREADY_EXISTS and is surfaced as a 409.
 */
async function runCreateReadingTransaction(
  data: CreateReadingDTO,
  meterVersion: number,
  prevReadingId: string,
  prevReadingData: any,
  propertyId: string,
): Promise<{readingRef: FirebaseFirestore.DocumentReference; billingId: string}> {
  const newReadingRef = firestore.collection(COLLECTIONS.READINGS).doc();
  const lockRef = firestore.collection(COLLECTIONS.READING_LOCKS).doc(
    readingLockId(data.meter_group_id, data.property_id, data.reading_date)
  );

  validateMeterRollback(
    prevReadingData.reading_amount,
    prevReadingData.meter_version ?? 1,
    data.reading_amount,
    meterVersion
  );

  const newReadingData = {
    ...data,
    meter_version: meterVersion,
    created_at: FieldValue.serverTimestamp(),
    is_deleted: false,
    deleted_at: null,
  };

  const newReadingForBilling = {
    meter_group_id: data.meter_group_id,
    reading_amount: data.reading_amount,
    reading_date: data.reading_date,
    meter_version: meterVersion,
  };

  let billingId = "";
  try {
    await firestore.runTransaction(async (txn) => {
      txn.create(lockRef, {created_at: FieldValue.serverTimestamp()});
      txn.set(newReadingRef, newReadingData);
      billingId = billingService.createFromReadings(
        txn,
        propertyId,
        prevReadingId,
        newReadingRef.id,
        prevReadingData,
        newReadingForBilling,
      );
    });
  } catch (err) {
    if (isAlreadyExistsError(err)) {
      throw new AppError(
        409,
        "A reading for this property and meter group is already being submitted for this month. Please retry."
      );
    }
    throw err;
  }

  return {readingRef: newReadingRef, billingId};
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

  // Get the specific property for this reading
  const propertySnap = await firestore
    .collection(COLLECTIONS.PROPERTIES)
    .doc(data.property_id)
    .get();

  if (!propertySnap.exists || propertySnap.data()?.is_deleted) {
    const payload: ReadingCreatePayload = {...data, meter_version: meterVersion};
    return cachedRepo.create(payload);
  }

  const {readingRef, billingId} = await runCreateReadingTransaction(
    data,
    meterVersion,
    prevReading.id,
    prevReading.data,
    propertySnap.id,
  );

  const snap = await readingRef.get();
  const reading = snapshotToModel<Reading>(snap);
  await cacheSet(`utilitool:readings:id:${reading.id}`, reading, CACHE_TTL);
  await listAppend(`utilitool:readings:all:${userId}`, reading);

  if (billingId) {
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

    const {readingRef, billingId} = await runCreateReadingTransaction(
      readingData,
      readingData.meter_version,
      prevReading.id,
      prevReading.data,
      readingData.property_id,
    );

    const snap = await readingRef.get();
    const reading = snapshotToModel<Reading>(snap);
    await cacheSet(`utilitool:readings:id:${reading.id}`, reading, CACHE_TTL);
    await listAppend(`utilitool:readings:all:${userId}`, reading);

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
