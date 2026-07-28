import {Timestamp} from "firebase-admin/firestore";
import {BaseModel} from "../../utils/model.util";

export interface BillingCycle extends BaseModel {
    meter_group_id: string;
    billing_ids: Record<string, number>;
    billing_rate: number;
    billing_consumption: number;
    billing_start_date: Timestamp;
    billing_end_date: Timestamp;
    overdue_date?: Timestamp;
    /**
     * Exponential moving average of billing_rate for this meter_group_id, as of this cycle
     * (inclusive) — an immutable-per-cycle snapshot, not a mutable running value. Recomputed by
     * `recomputeRateEmaForMeterGroup` (billing-cycle.service.ts) each time a cycle is created or
     * a rate/date-affecting field is corrected — but only over the bounded range of cycles that
     * could actually change (from the earliest affected billing_start_date onward, seeded from
     * the nearest earlier cycle's own rate_ema), not the meter group's entire history; EMA is
     * causal, so nothing before that point is ever touched. Missing on cycles created before
     * this feature shipped, until scripts/backfill-rate-ema.ts runs (which still recomputes the
     * full history, since it has no bounded range to anchor from) — callers must treat undefined
     * the same as "no estimate available".
     */
    rate_ema?: number;
}
