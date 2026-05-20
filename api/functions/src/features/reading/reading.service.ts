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

const validator = new ReadingValidator();

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

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
    if ((curr.meter_version ?? 1) === (prev.meter_version ?? 1)) {
      const delta = curr.reading_amount - prev.reading_amount;
      if (delta > 0) deltas.push(delta);
    }
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

/**
 * Compute the start (inclusive) / end (exclusive) of the calendar month
 * immediately preceding the supplied reading_date, in Asia/Manila timezone.
 */
function getPreviousMonthWindow(readingDate: Timestamp): { start: Timestamp; end: Timestamp } {
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

type ReadingSearchOptions = {
  meterGroupId?: string;
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

    // Look up the previous-month reading for the same meter_group.
    const prevWindow = getPreviousMonthWindow(data.reading_date);
    const prevReadingSnap = await firestore
      .collection(COLLECTIONS.READINGS)
      .where("meter_group_id", "==", data.meter_group_id)
      .where("is_deleted", "==", false)
      .where("reading_date", ">=", prevWindow.start)
      .where("reading_date", "<", prevWindow.end)
      .orderBy("reading_date", "desc")
      .limit(1)
      .get();

    // First-time scenario: no previous-month reading. Fall back to a plain
    // create — no billings to generate.
    if (prevReadingSnap.empty) {
      return readingRepository.create({ ...data, meter_version } as any);
    }

    const prevReadingDoc = prevReadingSnap.docs[0];
    const prevReadingId = prevReadingDoc.id;
    const prevReadingData = prevReadingDoc.data();

    // Find all non-deleted properties that reference this meter_group.
    // Properties store meter_groups as a map keyed by utility_type
    // ({ electricity: <id>, water: <id> }), so we query each known utility
    // type and merge results.
    const [electricitySnap, waterSnap] = await Promise.all([
      firestore
        .collection(COLLECTIONS.PROPERTIES)
        .where("meter_groups.electricity", "==", data.meter_group_id)
        .where("is_deleted", "==", false)
        .get(),
      firestore
        .collection(COLLECTIONS.PROPERTIES)
        .where("meter_groups.water", "==", data.meter_group_id)
        .where("is_deleted", "==", false)
        .get(),
    ]);

    const propertyById = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    for (const doc of [...electricitySnap.docs, ...waterSnap.docs]) {
      if (!propertyById.has(doc.id)) {
        propertyById.set(doc.id, doc);
      }
    }
    const properties = Array.from(propertyById.values());

    // No properties consume this meter group — no billings to write. Save the
    // reading normally.
    if (properties.length === 0) {
      return readingRepository.create({ ...data, meter_version } as any);
    }

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
   * Batch create skips auto-billing for simplicity: callers using the batch
   * endpoint are expected to manage billings themselves, and mixing many
   * transactional auto-billings into a batch creates fan-out semantics that
   * are difficult to reason about. Single POST /readings is the supported
   * entry point for auto-billing.
   */
  async createBatch(data: CreateReadingDTO[]): Promise<Reading[]> {
    await validator.validateBatch(data);

    const meterGroupIds = [...new Set(data.map((r) => r.meter_group_id))];
    const meterGroupMap = new Map<string, MeterGroup>();
    for (const mgId of meterGroupIds) {
      const mg = await meterGroupRepository.getById(mgId);
      if (mg) meterGroupMap.set(mgId, mg);
    }

    const readingsWithVersion = data.map((r) => ({
      ...r,
      meter_version: meterGroupMap.get(r.meter_group_id)?.current_version ?? 1,
    }));

    return readingRepository.createBatch(readingsWithVersion as any);
  },

  async search(options: ReadingSearchOptions): Promise<PaginatedResult<Reading>> {
    return readingRepository.search({
      limit: options.limit,
      orderBy: "created_at",
      orderDirection: "desc",
      cursor: options.cursor,
      archived: options.archived,
      filters: {
        ...(options.meterGroupId ? {meter_group_id: options.meterGroupId} : {}),
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
