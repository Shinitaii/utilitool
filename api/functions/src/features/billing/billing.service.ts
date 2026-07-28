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
import {fetchSeedAndAffected} from "../../utils/anchor-fetch.util";

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

/**
 * cost estimate = raw consumption (currReading - prevReading) x the meter group's latest
 * rate EMA — see createFromReadings' doc comment for why this is null across a meter-version
 * reset or when no prior cycle exists yet. Extracted as a pure function for unit testing;
 * production callers always go through createFromReadings.
 */
export function computeEstimatedCost(
  currReadingAmount: number,
  prevReadingAmount: number,
  currMeterVersion: number,
  prevMeterVersion: number,
  latestCycleRateEma: number | null
): number | null {
  if (latestCycleRateEma === null || currMeterVersion !== prevMeterVersion) {
    return null;
  }
  return (currReadingAmount - prevReadingAmount) * latestCycleRateEma;
}

/**
 * Recomputes estimated_cost for every pending (uncycled) billing in a meter group, using its
 * latest rate_ema. Called by billing-cycle.service.ts's recomputeRateEmaForMeterGroup right
 * after it recomputes the cycle chain, so a rate correction (or a gamma backfill) that shifts
 * rate_ema propagates into every still-pending billing's estimate instead of leaving it stuck
 * on the value computed at creation time — see billing.model.ts's estimated_cost doc comment.
 * `cycledBillingIds` (billing IDs already referenced by some cycle's billing_ids map) marks
 * which billings to leave alone: once a billing has an official cycle, its estimate is no
 * longer "pending" and correcting the cycle's own billing_rate replaces it directly.
 *
 * `anchorDate`, when given, bounds the billings query to `billing_period_date >= anchorDate`
 * via the shared `fetchSeedAndAffected` helper (same bounded-fetch shape as
 * `recomputeRateEmaForMeterGroup`'s cycle chain), instead of scanning every billing in the
 * group. The caller only passes it when a cycle already existed before that anchor — see
 * `recomputeRateEmaForMeterGroup`'s `pendingEstimatesAnchor` — so this never has to reason
 * about the group's very first cycle here. Omitted, this falls back to today's full scan
 * (bounded to 1000, same assumption as `recomputeRateEmaForMeterGroup`'s own fallback).
 */
async function recomputePendingEstimates(
  userId: string,
  meterGroupId: string,
  latestRateEma: number | null,
  cycledBillingIds: Set<string>,
  anchorDate?: Date
): Promise<void> {
  if (latestRateEma === null) return;

  const cachedRepo = repoFor(userId);

  let candidates: Billing[];
  if (anchorDate) {
    // Requires a `billings` index on `(is_deleted, meter_group_id, billing_period_date)` — see
    // api/firestore.indexes.json.
    const {affected} = await fetchSeedAndAffected(
      cachedRepo,
      {meter_group_id: meterGroupId},
      "billing_period_date",
      anchorDate
    );
    candidates = affected;
  } else {
    // limit: 1000 — same bounded-scale assumption as recomputeRateEmaForMeterGroup's cycle fetch.
    // searchDirect (bounded, Firestore-side-filtered, bypasses the list cache) instead of
    // search() — this recompute needs a correctness-critical, narrowly-scoped read, not the
    // full-collection list cache. Requires a `billings` index on
    // `(is_deleted, meter_group_id, created_at)` — see api/firestore.indexes.json.
    const {data} = await cachedRepo.searchDirect({
      limit: 1000,
      orderBy: "created_at",
      orderDirection: "asc",
      filters: {meter_group_id: meterGroupId},
    });
    candidates = data;
  }

  const pending = candidates.filter((b) => !cycledBillingIds.has(b.id));
  if (pending.length === 0) return;

  const readingIds = Array.from(
    new Set(pending.flatMap((b) => [b.previous_reading_id, b.current_reading_id]))
  );
  const readings = await readingRepository.getByIds(readingIds);
  const readingById = new Map(
    readings.filter((r): r is NonNullable<typeof r> => r !== null).map((r) => [r.id, r])
  );

  const updates = pending
    .map((b) => {
      const prevReading = readingById.get(b.previous_reading_id);
      const currReading = readingById.get(b.current_reading_id);
      if (!prevReading || !currReading) return null;

      const newEstimate = computeEstimatedCost(
        currReading.reading_amount,
        prevReading.reading_amount,
        currReading.meter_version ?? 1,
        prevReading.meter_version ?? 1,
        latestRateEma
      );
      return newEstimate !== b.estimated_cost ? {id: b.id, data: {estimated_cost: newEstimate}} : null;
    })
    .filter((u): u is {id: string; data: {estimated_cost: number | null}} => u !== null);

  if (updates.length > 0) {
    await cachedRepo.updateBatch(updates);
  }
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
        // Manual/correction path — not the auto-billing flow the rate-EMA estimate targets
        // (see createFromReadings). No known-consumption-at-creation-time signal exists here
        // worth estimating from.
        estimated_cost: null,
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
          estimated_cost: null, // manual path — see create()'s comment
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
   * `latestCycleRateEma` is the meter group's latest closed BillingCycle.rate_ema, resolved by
   * the caller *before* this transaction opens (Firestore transactions require all reads
   * before any writes — see reading.util.ts's createReadingWithAutoBilling). estimated_cost is
   * null when that's unavailable (cold start, no cycle yet) or when the reading pair crosses a
   * meter-version reset, since a raw reading_amount diff isn't meaningful without resolving
   * the full cumulative-offset chain for that case.
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
    latestCycleRateEma: number | null,
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

    const estimatedCost = computeEstimatedCost(
      currReading.reading_amount,
      prevReading.reading_amount,
      currMeterVersion,
      prevMeterVersion,
      latestCycleRateEma
    );

    const newRef = firestore.collection(COLLECTIONS.BILLINGS).doc();
    txn.set(newRef, {
      property_id: propertyId,
      previous_reading_id: prevReadingId,
      current_reading_id: currReadingId,
      ...deriveBillingDenormalizedFields(currReading as any),
      payment_status: "pending" as const,
      estimated_cost: estimatedCost,
      created_at: FieldValue.serverTimestamp(),
      is_deleted: false,
      deleted_at: null,
    });
    return newRef.id;
  },

  recomputePendingEstimates,
};
