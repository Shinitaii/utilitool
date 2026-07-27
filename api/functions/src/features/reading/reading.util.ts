import {Timestamp, FieldValue} from "firebase-admin/firestore";
import {AppError} from "../../utils/error.util";
import {firestore} from "../../config/firebase.config";
import {COLLECTIONS} from "../../constants/collection.constants";
import {snapshotToModel} from "../../utils/firestore.util";
import {cacheSet} from "../../utils/cache.util";
import {listAppend, listAppendMany} from "../../utils/list-cache.util";
import {billingService} from "../billing/billing.service";
import {billingRepository} from "../billing/billing.repository";
import {billingCycleRepository} from "../billing-cycle/billing-cycle.repository";
import {readingRepository} from "./reading.repository";
import {CachedRepository} from "../../lib/cached-repository.lib";
import type {CreateReadingDTO} from "./reading.dto";
import type {Reading} from "./reading.model";
import type {Billing} from "../billing/billing.model";
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
 * Property.meter_groups[entry].versions is the source of truth for both main
 * meters and submeters (MeterGroup.versions is deprecated — see MeterGroup model).
 */
export function resolveVersionsSource(
  meterGroup: MeterGroup | null | undefined,
  property: Property | null | undefined,
  meterGroupId: string
): Record<string, MeterGroupVersionEntry> | undefined {
  if (property) {
    const entry = Object.values(property.meter_groups).find((e) => e?.meter_group_id === meterGroupId);
    if (entry?.versions !== undefined) {
      return entry.versions;
    }
  }
  return meterGroup?.versions;
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
 * given property + meter group. Property.meter_groups[entry].current_version is
 * the source of truth for both main meters and submeters (MeterGroup.current_version
 * is deprecated — see MeterGroup model).
 */
export function resolveMeterVersion(
  property: Property | null | undefined,
  meterGroupId: string,
  meterGroup: MeterGroup | null | undefined
): number {
  const entry = property ?
    Object.values(property.meter_groups).find((e) => e.meter_group_id === meterGroupId) :
    undefined;

  if (entry?.current_version !== undefined) {
    return entry.current_version;
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

// Passed to the CachedRepository constructed below — unused by searchDirect (which bypasses
// caching entirely), kept only to match billing-cycle.service.ts's own TTL for this feature.
const BILLING_CYCLE_CACHE_TTL = 15 * 60;

/**
 * Reads the meter group's latest cycle's rate_ema, for estimating a new billing's cost before
 * the reading-creation transaction opens (Firestore transactions require all reads before any
 * writes). Uses CachedRepository.searchDirect — the sanctioned cache-bypass escape hatch for
 * correctness-critical, narrowly-scoped reads (see cached-repository.lib.ts) — constructed
 * directly here rather than imported from billing-cycle.service.ts (that service already
 * imports from this file, so importing it back here would create a circular dependency;
 * searchDirect lives on the generic CachedRepository class, so this needs no import from
 * billing-cycle.service.ts at all).
 * Returns null when the meter group has no cycles yet, or none have been backfilled/computed
 * with a rate_ema (see scripts/backfill-rate-ema.ts).
 */
async function getLatestRateEma(userId: string, meterGroupId: string): Promise<number | null> {
  const cachedRepo = new CachedRepository(billingCycleRepository, userId, "billing-cycles", BILLING_CYCLE_CACHE_TTL);
  const {data} = await cachedRepo.searchDirect({
    limit: 1,
    orderBy: "billing_start_date",
    orderDirection: "desc",
    filters: {meter_group_id: meterGroupId},
  });
  return data[0]?.rate_ema ?? null;
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
  latestCycleRateEma: number | null,
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
        latestCycleRateEma,
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

  const latestCycleRateEma = await getLatestRateEma(userId, data.meter_group_id);

  const {readingRef, billingId} = await runCreateReadingTransaction(
    data,
    meterVersion,
    prevReading.id,
    prevReading.data,
    propertySnap.id,
    latestCycleRateEma,
  );

  const snap = await readingRef.get();
  const reading = snapshotToModel<Reading>(snap);
  await cacheSet(`utilitool:readings:id:${reading.id}`, reading, CACHE_TTL);
  await listAppend(`utilitool:readings:all:${userId}`, reading, CACHE_TTL);

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
 *
 * Cache population is batched once across the whole call (after every item's write
 * settles), not per-item inside the parallel map: the list cache is a single
 * read-modify-write key per user, so N concurrent single-item `listAppend` calls on it
 * (one per batch item) would race — the same class of bug `listAppendMany` was
 * introduced to fix in `CachedRepository.createBatch` (see `cached-repository.lib.ts`).
 * Reading/billing writes themselves still go through the raw repositories (not
 * `CachedRepository.create()`, which would reintroduce the same per-item list-append).
 */
export async function createBatchReadingsWithAutoBilling(
  userId: string,
  readingsWithVersion: ReadingCreatePayload[],
): Promise<Reading[]> {
  const results = await Promise.all(readingsWithVersion.map(async (readingData) => {
    // Look for previous-month reading scoped to this property
    const prevReading = await findPreviousMonthReading(readingData.meter_group_id, readingData.property_id, readingData.reading_date);

    // If no previous reading, just create the reading
    if (!prevReading) {
      const reading = await readingRepository.create(readingData);
      return {reading, billing: null as Billing | null};
    }

    // Not deduplicated per meter_group_id across the batch — batches are capped small and
    // this mirrors the existing per-reading Promise.all parallelization, so a handful of
    // redundant reads for readings sharing a meter group is a non-issue here.
    const latestCycleRateEma = await getLatestRateEma(userId, readingData.meter_group_id);

    const {readingRef, billingId} = await runCreateReadingTransaction(
      readingData,
      readingData.meter_version,
      prevReading.id,
      prevReading.data,
      readingData.property_id,
      latestCycleRateEma,
    );

    const snap = await readingRef.get();
    const reading = snapshotToModel<Reading>(snap);
    const billing = billingId ? await billingRepository.getById(billingId) : null;

    return {reading, billing};
  }));

  const readings = results.map((r) => r.reading);
  const billings = results
    .map((r) => r.billing)
    .filter((b): b is Billing => b !== null);

  await Promise.all([
    Promise.all(readings.map((r) => cacheSet(`utilitool:readings:id:${r.id}`, r, CACHE_TTL))),
    listAppendMany(`utilitool:readings:all:${userId}`, readings, CACHE_TTL),
    Promise.all(billings.map((b) => cacheSet(`utilitool:billings:id:${b.id}`, b, 10 * 60))),
    listAppendMany(`utilitool:billings:all:${userId}`, billings, 10 * 60),
  ]);

  return readings;
}
