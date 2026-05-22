import {FieldValue, Timestamp} from "firebase-admin/firestore";
import {readingRepository} from "./reading.repository";
import {Reading} from "./reading.model";
import {CreateReadingDTO} from "./reading.dto";
import {PaginatedResult} from "../../utils/pagination.util";
import {ReadingValidator} from "./reading.validator";
import {AppError} from "../../utils/error.util";
import {geminiLib} from "../../lib/gemini.lib";
import {firestore} from "../../config/firebase.config";
import {COLLECTIONS} from "../../constants/collection.constants";
import {snapshotToModel} from "../../utils/firestore.util";
import {billingService} from "../billing/billing.service";
import {meterGroupRepository} from "../meter-group/meter-group.repository";
import {MeterGroup} from "../meter-group/meter-group.model";
import {getPreviousMonthWindow, findPreviousMonthReading} from "./reading.util";

const validator = new ReadingValidator();

type ReadingCreatePayload = CreateReadingDTO & { meter_version: number };

async function checkAnomalousReading(
  meterGroupId: string,
  newReadingAmount: number,
  meterVersion: number,
): Promise<void> {
  const recentResult = await readingRepository.search({
    limit: 6,
    orderBy: "reading_date",
    orderDirection: "desc",
    filters: { meter_group_id: meterGroupId },
  });
  const recentReadings = recentResult.data;

  if (recentReadings.length < 2) return;

  const sameVersionReadings = recentReadings.filter(
    (r) => (r.meter_version ?? 1) === meterVersion
  );
  if (sameVersionReadings.length < 1) return;

  const mostRecent = sameVersionReadings[0];
  if (newReadingAmount <= mostRecent.reading_amount) return;

  const deltas: number[] = [];
  for (let i = 0; i < sameVersionReadings.length - 1; i++) {
    const curr = sameVersionReadings[i];
    const prev = sameVersionReadings[i + 1];
    const delta = curr.reading_amount - prev.reading_amount;
    if (delta > 0) deltas.push(delta);
  }
  if (deltas.length === 0) return;

  const avgDelta = deltas.reduce((s, d) => s + d, 0) / deltas.length;
  const newDelta = newReadingAmount - mostRecent.reading_amount;

  if (newDelta > 5 * avgDelta) {
    throw new AppError(
      422,
      `Reading amount ${newReadingAmount} is unusually high. ` +
        `Average monthly delta for this meter group is ${Math.round(avgDelta)} units; ` +
        `this reading implies a delta of ${Math.round(newDelta)} units. ` +
        `If the meter was reset, record a reset on the meter group first.`
    );
  }
}


type ReadingSearchOptions = {
  meterGroupId?: string;
  propertyId?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  limit: number;
  cursor?: string | null;
  archived?: boolean;
};

export const readingService = {
  /**
   * Create a reading. If a reading already exists in the previous calendar
   * month (Asia/Manila) for the same meter_group, this automatically creates
   * one billing per property that references this meter_group, atomically
   * inside a Firestore transaction.
   *
   * Auto-billing is a side effect, invisible to the caller. The duplicate
   * "one reading per meter_group per month" rule is enforced by the validator
   * (see ReadingValidator.validateMeterGroupConstraints), which prevents
   * duplicate auto-billings from arising in the first place.
   */
  async create(data: CreateReadingDTO): Promise<Reading> {
    await validator.validateCreate(data);

    const meterGroup = await meterGroupRepository.getById(data.meter_group_id);
    const meter_version = meterGroup!.current_version ?? 1;
    await checkAnomalousReading(data.meter_group_id, data.reading_amount, meter_version);

    // Look up the previous-month reading for the same meter_group + property.
    const prevReading = await findPreviousMonthReading(data.meter_group_id, data.property_id, data.reading_date);

    // First-time scenario: no previous-month reading. Fall back to a plain
    // create — no billings to generate.
    if (!prevReading) {
      const payload: ReadingCreatePayload = { ...data, meter_version };
      return readingRepository.create(payload);
    }

    const prevReadingId = prevReading.id;
    const prevReadingData = prevReading.data;

    // Get the specific property for this reading
    const propertySnap = await firestore
      .collection(COLLECTIONS.PROPERTIES)
      .doc(data.property_id)
      .get();

    if (!propertySnap.exists || propertySnap.data()?.is_deleted) {
      const payload: ReadingCreatePayload = { ...data, meter_version };
      return readingRepository.create(payload);
    }

    const properties = [propertySnap];

    // Build the new reading document up front so we can use it inside the txn.
    const newReadingRef = firestore.collection(COLLECTIONS.READINGS).doc();
    const newReadingId = newReadingRef.id;
    const newReadingData = {
      ...data,
      meter_version,
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
      meter_version,
    };

    await firestore.runTransaction(async (txn) => {
      txn.set(newReadingRef, newReadingData);
      for (const propertyDoc of properties) {
        billingService.createFromReadings(
          txn,
          propertyDoc.id,
          prevReadingId,
          newReadingId,
          prevReadingData,
          newReadingForBilling,
        );
      }
    });

    const snap = await newReadingRef.get();
    return snapshotToModel<Reading>(snap);
  },

  /**
   * Batch create with simple auto-billing: for each reading, if a previous-month
   * reading exists for that meter group, create a billing automatically.
   * Uses atomic transactions per reading to ensure consistency.
   */
  async createBatch(data: CreateReadingDTO[]): Promise<Reading[]> {
    await validator.validateBatch(data);

    const meterGroupIds = [...new Set(data.map((r) => r.meter_group_id))];
    const meterGroupMap = new Map<string, MeterGroup>();
    for (const mgId of meterGroupIds) {
      const mg = await meterGroupRepository.getById(mgId);
      if (mg) meterGroupMap.set(mgId, mg);
    }

    const readingsWithVersion: ReadingCreatePayload[] = data.map((r) => ({
      ...r,
      meter_version: meterGroupMap.get(r.meter_group_id)?.current_version ?? 1,
    }));

    for (const r of readingsWithVersion) {
      await checkAnomalousReading(r.meter_group_id, r.reading_amount, r.meter_version);
    }

    // Create all readings, attempting auto-billing for each (parallelized)
    const readingPromises = readingsWithVersion.map(async (readingData) => {
      // Look for previous-month reading scoped to this property
      const prevReading = await findPreviousMonthReading(readingData.meter_group_id, readingData.property_id, readingData.reading_date);

      // If no previous reading, just create the reading
      if (!prevReading) {
        return readingRepository.create(readingData);
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

      await firestore.runTransaction(async (txn) => {
        txn.set(newReadingRef, newReadingDoc);
        billingService.createFromReadings(
          txn,
          readingData.property_id,
          prevReadingId,
          newReadingId,
          prevReadingData,
          newReadingForBilling,
        );
      });

      const snap = await newReadingRef.get();
      return snapshotToModel<Reading>(snap);
    });

    return Promise.all(readingPromises);
  },

  async search(options: ReadingSearchOptions): Promise<PaginatedResult<Reading>> {
    return readingRepository.search({
      limit: options.limit,
      orderBy: (options.sortBy ?? "created_at") as any,
      orderDirection: options.sortOrder ?? "desc",
      cursor: options.cursor,
      archived: options.archived,
      filters: {
        ...(options.meterGroupId ? {meter_group_id: options.meterGroupId} : {}),
        ...(options.propertyId ? {property_id: options.propertyId} : {}),
      },
    });
  },

  async getById(id: string): Promise<Reading | null> {
    return readingRepository.getById(id);
  },

  async update(id: string, data: Partial<CreateReadingDTO>): Promise<Reading> {
    await validator.validateUpdate(data);
    return readingRepository.update(id, data);
  },

  async updateBatch(updates: {id: string, data: Partial<CreateReadingDTO>}[]): Promise<Reading[]> {
    await validator.validateUpdateBatch(updates);
    return readingRepository.updateBatch(updates);
  },

  async delete(id: string): Promise<void> {
    return readingRepository.delete(id);
  },

  async softDelete(id: string): Promise<Reading> {
    return readingRepository.softDelete(id);
  },

  async restore(id: string): Promise<Reading> {
    const reading = await readingRepository.getById(id);
    if (!reading) {
      throw new AppError(404, "Reading not found");
    }
    return readingRepository.restore(id);
  },

  async extractReadingFromImage(imageUrl: string): Promise<number | null> {
    return geminiLib.extractReadingFromImage(imageUrl);
  },
};
