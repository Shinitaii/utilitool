import {parseTimestamp} from "../../utils/firestore.util";
import {UTILITY_TYPES, type UtilityType} from "../../constants/utility.constants";
import type {BillingCycle} from "./billing-cycle.model";

/**
 * Smoothing factor for the rate EMA, chosen via walk-forward backtest against
 * decisions/20260724_billing-cost-estimation-ml-finding.md's dataset. A finer/wider gamma sweep
 * (see the doc's "gamma=0.8 was not actually the sweet spot" follow-up) found the two utility
 * types don't share an optimum: water's MAPE has a genuine minimum around gamma=0.15, while
 * electricity's keeps improving down to gamma≈0.01 with no interior minimum in the range tested.
 * Falls back to water's value for any utility type not in this map (there are only two today).
 */
export const RATE_EMA_GAMMA_BY_UTILITY_TYPE: Record<UtilityType, number> = {
  [UTILITY_TYPES.WATER]: 0.15,
  [UTILITY_TYPES.ELECTRICITY]: 0.01,
};

/**
 * Chronological EMA of billing_rate, one value per cycle (inclusive of that cycle's own rate).
 * Pure function — no I/O, no mutation. `cycles` need not be pre-sorted; this sorts by
 * billing_start_date ascending internally so callers can pass raw query results directly.
 *
 * `seedEma` lets a caller resume the chain partway through instead of always starting from
 * `cycles[0]`'s own rate: since each value only depends on the previous one, a caller that
 * already knows the EMA immediately before `cycles[0]` (e.g. the meter group's nearest earlier
 * cycle) can pass it in and get identical results to running the full history through this
 * function, without needing every prior cycle in `cycles` — see
 * `recomputeRateEmaForMeterGroup`'s bounded-range fetch in `billing-cycle.service.ts`.
 */
export function computeRateEmaChain(
  cycles: Pick<BillingCycle, "id" | "billing_rate" | "billing_start_date">[],
  gamma: number,
  seedEma: number | null = null
): Map<string, number> {
  const alpha = 1 - gamma;
  const sorted = [...cycles].sort(
    (a, b) => parseTimestamp(a.billing_start_date).toMillis() - parseTimestamp(b.billing_start_date).toMillis()
  );

  const emaByCycleId = new Map<string, number>();
  let ema: number | null = seedEma;
  for (const cycle of sorted) {
    ema = ema === null ? cycle.billing_rate : alpha * cycle.billing_rate + (1 - alpha) * ema;
    emaByCycleId.set(cycle.id, ema);
  }
  return emaByCycleId;
}

/**
 * Latest item by billing_start_date, without assuming pre-sorted input. Shared so callers
 * needing "the latest cycle in this set" (e.g. to read its resulting rate_ema) don't each
 * re-derive their own sort/compare — see `recomputeRateEmaForMeterGroup` in
 * `billing-cycle.service.ts`.
 */
export function findLatestByStartDate<T extends Pick<BillingCycle, "billing_start_date">>(
  items: T[]
): T | null {
  return items.reduce<T | null>((latest, item) => {
    if (!latest) return item;
    return parseTimestamp(item.billing_start_date).toMillis() >
      parseTimestamp(latest.billing_start_date).toMillis() ? item : latest;
  }, null);
}
