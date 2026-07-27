import type {BaseModel, WithoutBaseModel} from "./model.util";
import type {CachedRepository} from "../lib/cached-repository.lib";
import type {SearchFilter} from "../lib/repository.lib";

/**
 * Bounded "seed nearest-before + affected on/after anchor" fetch, for any per-user chain of
 * records ordered by a single Date-typed field where a later record's derived value only ever
 * depends on earlier records, never the reverse — e.g. BillingCycle.rate_ema by
 * billing_start_date, or Billing.estimated_cost by billing_period_date. Instead of loading the
 * whole chain, this fetches just the single nearest record strictly before `anchorDate` (to seed
 * continuation of the chain) plus every record on/after `anchorDate` (the only ones whose
 * derived value can possibly change). Both reads run via `CachedRepository.searchDirect` — the
 * sanctioned cache-bypass path for correctness-critical, narrowly-scoped reads (see
 * cached-repository.lib.ts) — in parallel, since neither depends on the other.
 *
 * See `recomputeRateEmaForMeterGroup` (billing-cycle.service.ts) and `recomputePendingEstimates`
 * (billing.service.ts) for the two current callers.
 */
export async function fetchSeedAndAffected<T extends BaseModel>(
  cachedRepo: CachedRepository<T>,
  baseFilters: SearchFilter<WithoutBaseModel<T>>,
  anchorField: keyof WithoutBaseModel<T> & string,
  anchorDate: Date,
  affectedLimit: number = 1000
): Promise<{seed: T | null; affected: T[]}> {
  const [{data: seedItems}, {data: affected}] = await Promise.all([
    cachedRepo.searchDirect({
      limit: 1,
      orderBy: anchorField,
      orderDirection: "desc",
      filters: {...baseFilters, [anchorField]: {$lt: anchorDate}} as SearchFilter<WithoutBaseModel<T>>,
    }),
    cachedRepo.searchDirect({
      limit: affectedLimit,
      orderBy: anchorField,
      orderDirection: "asc",
      filters: {...baseFilters, [anchorField]: {$gte: anchorDate}} as SearchFilter<WithoutBaseModel<T>>,
    }),
  ]);

  return {seed: seedItems[0] ?? null, affected};
}
