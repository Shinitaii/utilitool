import {billingCycleRepository} from "./billing-cycle.repository";
import {BillingCycle} from "./billing-cycle.model";
import {CreateBillingCycleDTO} from "./billing-cycle.dto";
import {PaginatedResult} from "../../utils/pagination.util";
import {BillingCycleValidator} from "./billing-cycle.validator";
import {AppError} from "../../utils/error.util";
import {propertyRepository} from "../property/property.repository";
import {readingService} from "../reading/reading.service";
import {billingRepository} from "../billing/billing.repository";
import {billingService} from "../billing/billing.service";
import {findPreviousMonthReading, findCurrentMonthReading} from "../reading/reading.util";
import {CachedRepository} from "../../lib/cached-repository.lib";
import {firestore} from "../../config/firebase.config";
import {COLLECTIONS} from "../../constants/collection.constants";
import {snapshotToModel, parseTimestamp} from "../../utils/firestore.util";
import {BatchCreateResult} from "../../utils/batch-result.util";
import {applyDateRangeFilter} from "../../utils/date-range-filter.util";
import {computeRateEmaChain, findLatestByStartDate, RATE_EMA_GAMMA_BY_UTILITY_TYPE} from "./billing-cycle.util";
import {meterGroupRepository} from "../meter-group/meter-group.repository";
import {UTILITY_TYPES} from "../../constants/utility.constants";
import {fetchSeedAndAffected} from "../../utils/anchor-fetch.util";

const validator = new BillingCycleValidator();
const CACHE_TTL = 15 * 60; // 15 minutes

function repoFor(userId: string): CachedRepository<BillingCycle> {
  return new CachedRepository(billingCycleRepository, userId, "billing-cycles", CACHE_TTL);
}

/**
 * True when a cycle update touches a field that can change the EMA chain's values or ordering
 * (billing_rate, either date) or which chain it belongs to (meter_group_id). Shared by update()
 * and updateBatch() so the two can't drift apart on what counts as "chain-affecting."
 */
function chainAffectingFieldsChanged(data: Partial<CreateBillingCycleDTO>): boolean {
  return (
    data.billing_rate !== undefined ||
    data.billing_start_date !== undefined ||
    data.billing_end_date !== undefined ||
    data.meter_group_id !== undefined
  );
}

/**
 * Anchor = the earliest billing_start_date that could have shifted in the (new) group's chain:
 * for a same-group rate/date correction, that's the earlier of the cycle's old and new date (it
 * may have moved position); for a cross-group move, the cycle is a fresh insertion into its new
 * group, so just its own date.
 */
function computeAnchorDate(existing: BillingCycle | null, updated: BillingCycle): Date {
  const groupUnchanged = existing !== null && existing.meter_group_id === updated.meter_group_id;
  if (!groupUnchanged) {
    return parseTimestamp(updated.billing_start_date).toDate();
  }
  return new Date(Math.min(
    parseTimestamp(existing!.billing_start_date).toMillis(),
    parseTimestamp(updated.billing_start_date).toMillis()
  ));
}

/**
 * Merges a just-written cycle into a fetched set, unless it's already present (the anchor-bounded
 * fetch typically already includes it, since it was written before this call).
 */
function mergeFreshCycle(cycles: BillingCycle[], freshCycle?: BillingCycle): BillingCycle[] {
  if (freshCycle && !cycles.some((c) => c.id === freshCycle.id)) {
    return [...cycles, freshCycle];
  }
  return cycles;
}

/**
 * Recomputes billing_rate's EMA (rate_ema) for cycles belonging to a meter group, writing back
 * only the cycles whose value actually changed.
 *
 * EMA is causal — `ema[i]` only depends on `ema[i-1]` and cycle `i`'s own rate, never on
 * anything chronologically after it. So when `anchorDate` is given (the common single-cycle
 * create/update path), this fetches just two bounded slices instead of the meter group's
 * entire history: the single nearest cycle strictly before `anchorDate` (to seed the chain —
 * see `computeRateEmaChain`'s `seedEma` param) and every cycle on/after `anchorDate` (the only
 * ones whose EMA can possibly change) — via the shared `fetchSeedAndAffected` helper. `anchorDate`
 * must be the earliest billing_start_date among cycles affected by this operation — for a
 * straight append (new cycle after all existing ones) that's just the new cycle's own date; for
 * a correction that moves a cycle earlier/later, it's the min of its old and new date, so
 * anything in between is re-swept too.
 *
 * When `anchorDate` is omitted, falls back to a full recompute over the meter group's entire
 * cycle history (bounded to 1000 — meter groups here are submeter-scoped and stay in the
 * dozens of cycles) — used for the rarer cases where a clean single anchor doesn't apply: a
 * batch update touching several cycles at once, or cleaning up the *old* meter group's chain
 * after a cycle's meter_group_id changed (no freshCycle to anchor from there — the cycle no
 * longer belongs to this group at all, so everything from its old position forward needs a
 * clean full re-derivation).
 *
 * Called after create() and after any update() that could change the chain's values or
 * ordering (billing_rate, billing_start_date, billing_end_date). Writes go through the same
 * user-scoped CachedRepository as every other mutation in this service, so corrected cycles
 * don't serve a stale cached rate_ema.
 */
async function recomputeRateEmaForMeterGroup(
  userId: string,
  meterGroupId: string,
  freshCycle?: BillingCycle,
  anchorDate?: Date | null
): Promise<void> {
  const cachedRepo = repoFor(userId);

  let cycles: BillingCycle[];
  let seedEma: number | null = null;
  let meterGroup;
  // Only safe to anchor-bound recomputePendingEstimates's billing query the same way if a cycle
  // already existed before this anchor. If not (no seed cycle), this could be the meter group's
  // very first cycle ever — in which case older still-pending billings (previously stuck at
  // estimated_cost: null, since no rate_ema existed at all yet) would be wrongly excluded by an
  // anchor bound that only looks forward from this cycle's own date. Falls back to an unbounded
  // recompute in that one-time case; see billing.service.ts's recomputePendingEstimates.
  let pendingEstimatesAnchor: Date | undefined;

  if (anchorDate) {
    const [{seed, affected}, fetchedMeterGroup] = await Promise.all([
      fetchSeedAndAffected(cachedRepo, {meter_group_id: meterGroupId}, "billing_start_date", anchorDate),
      meterGroupRepository.getById(meterGroupId),
    ]);
    cycles = mergeFreshCycle(affected, freshCycle);
    seedEma = seed?.rate_ema ?? null;
    meterGroup = fetchedMeterGroup;
    pendingEstimatesAnchor = seed ? anchorDate : undefined;
  } else {
    // limit: 1000 — a meter group's cycle count stays in the dozens (one per month). Uses
    // searchDirect (bounded, Firestore-side-filtered, bypasses the list cache) rather than
    // search()/the in-memory list cache, since this full-history fallback path is exactly the
    // correctness-critical bounded-read shape searchDirect exists for.
    const [{data}, fetchedMeterGroup] = await Promise.all([
      cachedRepo.searchDirect({
        limit: 1000,
        orderBy: "billing_start_date",
        orderDirection: "asc",
        filters: {meter_group_id: meterGroupId},
      }),
      meterGroupRepository.getById(meterGroupId),
    ]);
    cycles = mergeFreshCycle(data, freshCycle);
    meterGroup = fetchedMeterGroup;
    pendingEstimatesAnchor = undefined;
  }

  const gamma = meterGroup ?
    RATE_EMA_GAMMA_BY_UTILITY_TYPE[meterGroup.utility_type] :
    RATE_EMA_GAMMA_BY_UTILITY_TYPE[UTILITY_TYPES.WATER];

  const emaByCycleId = computeRateEmaChain(cycles, gamma, seedEma);
  const updates = cycles
    .filter((c) => emaByCycleId.get(c.id) !== c.rate_ema)
    .map((c) => ({id: c.id, data: {rate_ema: emaByCycleId.get(c.id)!}}));

  if (updates.length > 0) {
    await cachedRepo.updateBatch(updates);
  }

  // Propagate the (possibly changed) rate_ema chain into any still-pending Billing.estimated_cost
  // in this meter group — see billing.service.ts's recomputePendingEstimates doc comment. Safe to
  // derive "latest cycle" from `cycles` alone even in the bounded-range path: the meter group's
  // true latest cycle can never predate `anchorDate` (anchorDate is itself some real cycle's
  // date), so it's always included in the `affected` slice.
  const cycledBillingIds = new Set(cycles.flatMap((c) => Object.keys(c.billing_ids)));
  const latestCycle = findLatestByStartDate(cycles);
  const latestRateEma = latestCycle ? emaByCycleId.get(latestCycle.id) ?? null : null;
  await billingService.recomputePendingEstimates(
    userId,
    meterGroupId,
    latestRateEma,
    cycledBillingIds,
    pendingEstimatesAnchor
  );
}

async function injectMainMeterBilling(
  userId: string,
  data: CreateBillingCycleDTO
): Promise<CreateBillingCycleDTO> {
  // Targeted array-contains query on the denormalized Property.main_meter_group_ids instead of
  // loading every property for this meter group — see Property.main_meter_group_ids's doc
  // comment. limit 2, not 1: a second match indicates the main-meter uniqueness invariant is
  // already violated, which should surface loudly rather than silently taking the first match.
  const {data: mainMeterCandidates} = await propertyRepository.search({
    limit: 2,
    orderBy: "created_at",
    filters: {main_meter_group_ids: {$arrayContains: data.meter_group_id}},
  });

  if (mainMeterCandidates.length > 1) {
    throw new AppError(
      500,
      `Meter group ${data.meter_group_id} has more than one main meter property — ` +
      "data integrity violation."
    );
  }

  const mainMeterProperty = mainMeterCandidates[0];

  if (!mainMeterProperty) return data;

  const submeterTotal = Object.values(data.billing_ids).reduce(
    (sum, c) => sum + c,
    0
  );
  const derivedConsumption = data.billing_consumption - submeterTotal;

  const prevReading = await findPreviousMonthReading(
    data.meter_group_id,
    mainMeterProperty.id,
    data.billing_end_date
  );

  if (!prevReading) {
    throw new AppError(
      400,
      `Main meter property "${mainMeterProperty.id}" has no seed reading. ` +
        "Record a baseline reading via POST /readings/seed before creating this billing cycle."
    );
  }

  const derivedReadingAmount =
    prevReading.data.reading_amount + derivedConsumption;

  // Passes through readingService.create() — anomaly guard and duplicate-month check
  // apply to the derived reading. If the derived amount triggers the 5× anomaly
  // threshold (e.g. after meter replacement in the billing period), this will throw 422.
  // Operators should reset the meter group before creating the billing cycle.
  let derivedReading;
  try {
    derivedReading = await readingService.create(userId, {
      meter_group_id: data.meter_group_id,
      property_id: mainMeterProperty.id,
      reading_amount: derivedReadingAmount,
      reading_date: data.billing_end_date,
    });
  } catch (err) {
    if (!(err instanceof AppError) || err.statusCode !== 409) {
      throw err;
    }

    const existing = await findCurrentMonthReading(
      data.meter_group_id,
      mainMeterProperty.id,
      data.billing_end_date
    );
    if (!existing) throw err;

    const existingSnap = await firestore.collection(COLLECTIONS.READINGS).doc(existing.id).get();
    derivedReading = snapshotToModel(existingSnap);
  }

  const {data: billings} = await billingRepository.search({
    limit: 1,
    orderBy: "created_at",
    filters: {current_reading_id: derivedReading.id},
  });

  if (!billings.length) {
    throw new AppError(
      400,
      "Main meter reading was recorded but no billing was auto-created. " +
        `Create it manually: POST /billings { property_id: "${mainMeterProperty.id}", ` +
        `previous_reading_id: "${prevReading.id}", current_reading_id: "${derivedReading.id}" }, ` +
        "then retry this billing cycle."
    );
  }

  return {
    ...data,
    billing_ids: {
      ...data.billing_ids,
      [billings[0].id]: derivedConsumption,
    },
  };
}

type BillingCycleSearchOptions = {
  meterGroupId?: string;
  billingStartDate?: string;
  billingEndDate?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  limit: number;
  cursor?: string | null;
  archived?: boolean;
};

export const billingCycleService = {
  async create(userId: string, data: CreateBillingCycleDTO): Promise<BillingCycle> {
    // Validate the submitted submeter consumption numbers BEFORE
    // injectMainMeterBilling derives a main-meter reading from their sum —
    // see validateSubmeterConsumption's doc comment.
    await validator.validateSubmeterConsumption(data);
    const enrichedData = await injectMainMeterBilling(userId, data);
    await validator.validateCreate(enrichedData);
    const cachedRepo = repoFor(userId);
    const created = await cachedRepo.create(enrichedData);
    await recomputeRateEmaForMeterGroup(
      userId,
      created.meter_group_id,
      created,
      parseTimestamp(created.billing_start_date).toDate()
    );
    return created;
  },

  /**
   * Processes each cycle independently: a duplicate or invalid item is
   * reported per-index in `failed` rather than aborting the whole batch, and
   * every other valid cycle is still created.
   */
  async createBatch(userId: string, data: CreateBillingCycleDTO[]): Promise<BatchCreateResult<BillingCycle>> {
    const failures: {index: number; error: string}[] = [];
    const seenMeterGroups = new Set<string>();
    const enrichedByIndex = new Map<number, CreateBillingCycleDTO>();

    for (let index = 0; index < data.length; index++) {
      const item = data[index];
      try {
        if (item.meter_group_id) {
          if (seenMeterGroups.has(item.meter_group_id)) {
            throw new AppError(
              400,
              `Duplicate meter_group_id "${item.meter_group_id}" in batch. ` +
              "Each billing cycle in a batch must be for a different meter group."
            );
          }
          seenMeterGroups.add(item.meter_group_id);
        }
        // Same ordering fix as create(): validate this item's submeter
        // consumption before injectMainMeterBilling derives a reading from it.
        await validator.validateSubmeterConsumption(item);
        const enriched = await injectMainMeterBilling(userId, item);
        enrichedByIndex.set(index, enriched);
      } catch (err) {
        failures.push({
          index,
          error: err instanceof AppError ? err.message : "Failed to process billing cycle",
        });
      }
    }

    const candidateIndexes = Array.from(enrichedByIndex.keys());
    const candidateItems = candidateIndexes.map((i) => enrichedByIndex.get(i)!);
    const {validIndexes, failures: validationFailures} = await validator.validateBatch(candidateItems);

    validationFailures.forEach((f) => {
      failures.push({index: candidateIndexes[f.index], error: f.error});
    });

    const toCreate = validIndexes.map((i) => candidateItems[i]);

    let created: BillingCycle[] = [];
    if (toCreate.length > 0) {
      const cachedRepo = repoFor(userId);
      created = await cachedRepo.createBatch(toCreate);
      // seenMeterGroups already guarantees one cycle per meter group in this batch, so each
      // created cycle needs exactly one independent recompute of its own group's chain.
      await Promise.all(
        created.map((cycle) => recomputeRateEmaForMeterGroup(
          userId,
          cycle.meter_group_id,
          cycle,
          parseTimestamp(cycle.billing_start_date).toDate()
        ))
      );
    }

    failures.sort((a, b) => a.index - b.index);
    return {created, failed: failures};
  },

  async search(
    userId: string,
    options: BillingCycleSearchOptions
  ): Promise<PaginatedResult<BillingCycle>> {
    const cachedRepo = repoFor(userId);

    // For archived queries, we need custom date filtering
    if (options.archived) {
      const filters: Record<string, any> = {
        ...(options.meterGroupId ? {meter_group_id: options.meterGroupId} : {}),
      };
      if (options.billingStartDate) {
        filters.billing_start_date = {gte: new Date(options.billingStartDate)};
      }
      if (options.billingEndDate) {
        filters.billing_end_date = {lte: new Date(options.billingEndDate)};
      }
      return billingCycleRepository.search({
        limit: options.limit,
        orderBy: (options.sortBy ?? "created_at") as any,
        orderDirection: options.sortOrder ?? "desc",
        cursor: options.cursor,
        archived: true,
        filters,
      });
    }

    // Load active items via cache and apply date filters in memory
    const result = await cachedRepo.search({
      limit: options.limit,
      orderBy: (options.sortBy ?? "created_at") as any,
      orderDirection: options.sortOrder ?? "desc",
      cursor: options.cursor,
      archived: false,
      filters: {
        ...(options.meterGroupId ? {meter_group_id: options.meterGroupId} : {}),
      },
    });

    // Post-filter for date ranges (can't query dates directly in Firestore query)
    result.data = applyDateRangeFilter(result.data, {
      startDate: options.billingStartDate,
      endDate: options.billingEndDate,
      startField: "billing_start_date",
      endField: "billing_end_date",
    });

    return result;
  },

  async getById(userId: string, id: string): Promise<BillingCycle | null> {
    const cachedRepo = repoFor(userId);
    return cachedRepo.getById(id);
  },

  async update(
    userId: string,
    id: string,
    data: Partial<CreateBillingCycleDTO>
  ): Promise<BillingCycle> {
    await validator.validateUpdate(id, data);
    const cachedRepo = repoFor(userId);
    const existing = await cachedRepo.getById(id);
    const updated = await cachedRepo.update(id, data);

    if (chainAffectingFieldsChanged(data)) {
      const newGroupAnchor = computeAnchorDate(existing, updated);
      await recomputeRateEmaForMeterGroup(userId, updated.meter_group_id, updated, newGroupAnchor);
      if (existing && existing.meter_group_id !== updated.meter_group_id) {
        // The cycle no longer belongs to its old group at all — everything from its old
        // position forward needs recomputing there, with no freshCycle to merge in.
        await recomputeRateEmaForMeterGroup(
          userId,
          existing.meter_group_id,
          undefined,
          parseTimestamp(existing.billing_start_date).toDate()
        );
      }
    }

    return updated;
  },

  async updateBatch(userId: string, updates: {id: string, data: Partial<CreateBillingCycleDTO>}[]): Promise<BillingCycle[]> {
    await validator.validateUpdateBatch(updates);
    const cachedRepo = repoFor(userId);
    const updated = await cachedRepo.updateBatch(updates);

    // Recomputes each affected cycle's (new) meter group only — unlike the single update(),
    // this doesn't also chase a changed meter_group_id back to its old group, since correcting
    // meter_group_id via batch update is not a supported UI flow today.
    const meterGroupIds = new Set<string>();
    updates.forEach((u, i) => {
      if (chainAffectingFieldsChanged(u.data)) meterGroupIds.add(updated[i].meter_group_id);
    });
    await Promise.all(
      [...meterGroupIds].map((meterGroupId) => recomputeRateEmaForMeterGroup(userId, meterGroupId))
    );

    return updated;
  },

  async delete(userId: string, id: string): Promise<void> {
    const cachedRepo = repoFor(userId);
    await cachedRepo.delete(id);
  },

  async softDelete(userId: string, id: string): Promise<BillingCycle> {
    const cachedRepo = repoFor(userId);
    return cachedRepo.softDelete(id);
  },

  async restore(userId: string, id: string): Promise<BillingCycle> {
    const billingCycle = await billingCycleRepository.getById(id);
    if (!billingCycle) {
      throw new AppError(404, "Billing cycle not found");
    }
    const cachedRepo = repoFor(userId);
    return cachedRepo.restore(id);
  },

  /**
   * Permanently delete an already-archived billing cycle. Second step of the
   * archive-then-purge lifecycle — throws 409 if the cycle is still active.
   */
  async purge(userId: string, id: string): Promise<void> {
    const cachedRepo = repoFor(userId);
    await cachedRepo.purge(id);
  },
};
