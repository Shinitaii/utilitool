import {FieldValue, Transaction, DocumentData, Timestamp} from "firebase-admin/firestore";
import {firestore} from "../../config/firebase.config";
import {billingRepository} from "./billing.repository";
import {Billing} from "./billing.model";
import {CreateBillingDTO} from "./billing.dto";
import {PaginatedResult} from "../../utils/pagination.util";
import {BillingValidator} from "./billing.validator";
import {AppError} from "../../utils/error.util";
import {COLLECTIONS} from "../../constants/collection.constants";
import {snapshotToModel} from "../../utils/firestore.util";
import {applyDateRangeFilter} from "../../utils/date-range-filter.util";
import {validateMeterRollback} from "../reading/reading.util";
import {cacheSet} from "../../utils/cache.util";
import {listAppend} from "../../utils/list-cache.util";
import {CachedRepository} from "../../lib/cached-repository.lib";
import {readingRepository} from "../reading/reading.repository";

const validator = new BillingValidator();
const CACHE_TTL = 10 * 60; // 10 minutes

function repoFor(userId: string): CachedRepository<Billing> {
  return new CachedRepository(billingRepository, userId, "billings", CACHE_TTL);
}

/**
 * Derives the denormalized fields Billing copies off its current reading
 * (meter_group_id + billing_period_date). Single source of the copy logic so
 * create/createBatch/createFromReadings and update() can't drift apart.
 * Accepts any reading-shaped value (DocumentData from a txn snapshot or a
 * resolved Reading model) — both carry meter_group_id/reading_date.
 */
function deriveBillingDenormalizedFields(
  currReading: { meter_group_id: string; reading_date: Timestamp }
): { meter_group_id: string; billing_period_date: Timestamp } {
  return {
    meter_group_id: currReading.meter_group_id,
    billing_period_date: currReading.reading_date,
  };
}

type BillingSearchOptions = {
  propertyId?: string;
  meterGroupId?: string;
  startDate?: string;
  endDate?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  limit: number;
  cursor?: string | null;
  archived?: boolean;
};

export const billingService = {
  async create(userId: string, data: CreateBillingDTO): Promise<Billing> {
    // Run validation + creation inside a transaction so referenced documents
    // cannot be deleted between validation reads and the billing write.
    let newBillingId: string | null = null;

    await firestore.runTransaction(async (txn) => {
      const propertyRef = firestore.collection(COLLECTIONS.PROPERTIES).doc(data.property_id);
      const prevReadingRef = firestore.collection(COLLECTIONS.READINGS).doc(data.previous_reading_id);
      const currReadingRef = firestore.collection(COLLECTIONS.READINGS).doc(data.current_reading_id);

      // All reads must come before writes in a Firestore transaction
      const [propertySnap, prevReadingSnap, currReadingSnap] = await Promise.all([
        txn.get(propertyRef),
        txn.get(prevReadingRef),
        txn.get(currReadingRef),
      ]);

      if (!propertySnap.exists || propertySnap.data()?.is_deleted) {
        throw new AppError(404, "Property not found");
      }
      if (!prevReadingSnap.exists || prevReadingSnap.data()?.is_deleted) {
        throw new AppError(404, "Previous reading not found");
      }
      if (!currReadingSnap.exists || currReadingSnap.data()?.is_deleted) {
        throw new AppError(404, "Current reading not found");
      }

      const prevReading = prevReadingSnap.data()!;
      const currReading = currReadingSnap.data()!;

      if (prevReading.meter_group_id !== currReading.meter_group_id) {
        throw new AppError(400, "Previous and current readings must belong to the same meter group");
      }
      const currMeterVersion = (currReading.meter_version ?? 1) as number;
      const prevMeterVersion = (prevReading.meter_version ?? 1) as number;
      validateMeterRollback(
        prevReading.reading_amount,
        prevMeterVersion,
        currReading.reading_amount,
        currMeterVersion
      );

      const newRef = firestore.collection(COLLECTIONS.BILLINGS).doc();
      newBillingId = newRef.id;
      txn.set(newRef, {
        ...data,
        ...deriveBillingDenormalizedFields(currReading as any),
        payment_status: "pending" as const,
        created_at: FieldValue.serverTimestamp(),
        is_deleted: false,
        deleted_at: null,
      });
    });

    // Read the newly created document after the transaction commits
    const snap = await firestore.collection(COLLECTIONS.BILLINGS).doc(newBillingId!).get();
    const billing = snapshotToModel<Billing>(snap);
    await cacheSet(`utilitool:billings:id:${billing.id}`, billing, CACHE_TTL);
    await listAppend(`utilitool:billings:all:${userId}`, billing, CACHE_TTL);
    return billing;
  },

  async createBatch(userId: string, data: CreateBillingDTO[]): Promise<Billing[]> {
    await validator.validateBatch(data);

    // Batch is capped at 10 items (CreateBillingBatchDTOSchema), so this is a small,
    // one-time lookup — resolves meter_group_id/reading_date for the denormalized fields
    // below, mirroring what create()/createFromReadings() already get for free from their
    // transaction reads.
    const currentReadingIds = Array.from(new Set(data.map((item) => item.current_reading_id)));
    const currentReadings = await readingRepository.getByIds(currentReadingIds);
    const readingById = new Map(
      currentReadings.filter((r): r is NonNullable<typeof r> => r !== null).map((r) => [r.id, r])
    );

    const cachedRepo = repoFor(userId);
    const created = await cachedRepo.createBatch(
      data.map((item) => {
        const currReading = readingById.get(item.current_reading_id)!;
        return {
          ...item,
          ...deriveBillingDenormalizedFields(currReading),
          payment_status: "pending" as const,
        };
      })
    );
    return created;
  },

  async search(userId: string, options: BillingSearchOptions): Promise<PaginatedResult<Billing>> {
    const cachedRepo = repoFor(userId);

    // Archived queries go direct to Firestore, same as billing-cycle.service.ts —
    // range filters can be pushed down to the query since there's no list cache involved.
    if (options.archived) {
      const filters: Record<string, any> = {
        ...(options.propertyId ? {property_id: options.propertyId} : {}),
        ...(options.meterGroupId ? {meter_group_id: options.meterGroupId} : {}),
      };
      if (options.startDate) {
        filters.billing_period_date = {...filters.billing_period_date, gte: new Date(options.startDate)};
      }
      if (options.endDate) {
        filters.billing_period_date = {...filters.billing_period_date, lte: new Date(options.endDate)};
      }
      return billingRepository.search({
        limit: options.limit,
        orderBy: (options.sortBy ?? "created_at") as any,
        orderDirection: options.sortOrder ?? "desc",
        cursor: options.cursor,
        archived: true,
        filters,
      });
    }

    // Active items: load the cached list, apply equality filters via CachedRepository,
    // then post-filter date range in memory — CachedRepository.applyFilters rejects range
    // filters outright, so date filtering can't be pushed into the same call. Mirrors the
    // same two-step pattern billing-cycle.service.ts uses for its date filters.
    const result = await cachedRepo.search({
      limit: options.limit,
      orderBy: (options.sortBy ?? "created_at") as any,
      orderDirection: options.sortOrder ?? "desc",
      cursor: options.cursor,
      archived: false,
      filters: {
        ...(options.propertyId ? {property_id: options.propertyId} : {}),
        ...(options.meterGroupId ? {meter_group_id: options.meterGroupId} : {}),
      },
    });

    result.data = applyDateRangeFilter(result.data, {
      startDate: options.startDate,
      endDate: options.endDate,
      startField: "billing_period_date",
      endField: "billing_period_date",
    });

    return result;
  },

  async getById(userId: string, id: string): Promise<Billing | null> {
    const cachedRepo = repoFor(userId);
    return cachedRepo.getById(id);
  },

  /**
   * Batch ID lookup for clients that otherwise resolve IDs one at a time
   * (e.g. the UI's entity-lookup-cache.ts) — one round-trip instead of N.
   * Goes through the raw repository (not the per-user list cache), same as
   * every other getByIds caller in this codebase (reports.service.ts, etc.).
   */
  async getByIds(ids: string[]): Promise<Billing[]> {
    const results = await billingRepository.getByIds(ids);
    return results.filter((b): b is Billing => b !== null);
  },

  async update(userId: string, id: string, data: Partial<CreateBillingDTO> & { payment_status?: "pending" | "paid"; paid_at?: string }): Promise<Billing> {
    await validator.validateUpdate(id, data);

    const updateData: Record<string, unknown> = {...data};
    if (data.payment_status === "paid" && !data.paid_at) {
      updateData.paid_at = new Date().toISOString();
    }

    // Keep the denormalized fields in sync when the current reading changes via
    // the PATCH correction escape hatch — otherwise meter_group_id /
    // billing_period_date would silently point at the old reading.
    if (data.current_reading_id) {
      const currReading = await readingRepository.getById(data.current_reading_id);
      if (!currReading) {
        throw new AppError(404, "Current reading not found");
      }
      Object.assign(updateData, deriveBillingDenormalizedFields(currReading));
    }

    const cachedRepo = repoFor(userId);
    return cachedRepo.update(id, updateData);
  },

  async updateBatch(userId: string, updates: {id: string, data: Partial<CreateBillingDTO>}[]): Promise<Billing[]> {
    await validator.validateUpdateBatch(updates);

    // Re-derive denormalized fields for any item whose current reading changes,
    // mirroring update()'s single-item sync.
    const changedReadingIds = Array.from(
      new Set(updates.map((u) => u.data.current_reading_id).filter((x): x is string => !!x))
    );
    const readingById = new Map<string, Awaited<ReturnType<typeof readingRepository.getById>>>();
    if (changedReadingIds.length > 0) {
      const readings = await readingRepository.getByIds(changedReadingIds);
      readings.forEach((r) => r && readingById.set(r.id, r));
    }
    const enriched = updates.map((u) => {
      if (u.data.current_reading_id) {
        const currReading = readingById.get(u.data.current_reading_id);
        if (currReading) {
          return {id: u.id, data: {...u.data, ...deriveBillingDenormalizedFields(currReading)}};
        }
      }
      return u;
    });

    const cachedRepo = repoFor(userId);
    return cachedRepo.updateBatch(enriched);
  },

  async delete(userId: string, id: string): Promise<void> {
    const cachedRepo = repoFor(userId);
    await cachedRepo.delete(id);
  },

  async softDelete(userId: string, id: string): Promise<Billing> {
    const cachedRepo = repoFor(userId);
    return cachedRepo.softDelete(id);
  },

  async restore(userId: string, id: string): Promise<Billing> {
    const billing = await billingRepository.getById(id);
    if (!billing) {
      throw new AppError(404, "Billing not found");
    }
    const cachedRepo = repoFor(userId);
    return cachedRepo.restore(id);
  },

  /**
   * Permanently delete an already-archived billing. Second step of the
   * archive-then-purge lifecycle — throws 409 if the billing is still active.
   */
  async purge(userId: string, id: string): Promise<void> {
    const cachedRepo = repoFor(userId);
    await cachedRepo.purge(id);
  },

  /**
   * Write a new billing document within an already-open Firestore transaction.
   * Called by the reading service when auto-creating billings during a reading
   * create/update transaction. Existence checks are skipped because the caller
   * has already verified the documents inside the same transaction.
   *
   * Applies the meter_version rollback bypass: if currReading.meter_version differs
   * from prevReading.meter_version the reading_amount comparison is not enforced.
   *
   * Returns the newly generated billing ID for cache population post-transaction.
   */
  createFromReadings(
    txn: Transaction,
    propertyId: string,
    prevReadingId: string,
    currReadingId: string,
    prevReading: DocumentData,
    currReading: DocumentData,
  ): string {
    if (prevReading.meter_group_id !== currReading.meter_group_id) {
      throw new AppError(400, "Previous and current readings must belong to the same meter group");
    }
    const currMeterVersion = (currReading.meter_version ?? 1) as number;
    const prevMeterVersion = (prevReading.meter_version ?? 1) as number;
    validateMeterRollback(
      prevReading.reading_amount,
      prevMeterVersion,
      currReading.reading_amount,
      currMeterVersion
    );

    const newRef = firestore.collection(COLLECTIONS.BILLINGS).doc();
    txn.set(newRef, {
      property_id: propertyId,
      previous_reading_id: prevReadingId,
      current_reading_id: currReadingId,
      ...deriveBillingDenormalizedFields(currReading as any),
      payment_status: "pending" as const,
      created_at: FieldValue.serverTimestamp(),
      is_deleted: false,
      deleted_at: null,
    });
    return newRef.id;
  },
};
