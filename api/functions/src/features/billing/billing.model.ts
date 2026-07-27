import {Timestamp} from "firebase-admin/firestore";
import {BaseModel} from "../../utils/model.util";

export interface Billing extends BaseModel {
    property_id: string;
    previous_reading_id: string;
    current_reading_id: string;
    meter_group_id: string;
    billing_period_date: Timestamp;
    payment_status: "pending" | "paid";
    paid_at?: string;
    /**
     * Cost estimate (known consumption x the meter group's latest BillingCycle.rate_ema), before
     * the official cycle/rate lands. null when no prior cycle exists yet for the meter group, or
     * when the reading pair crosses a meter-version reset (raw amount diff isn't meaningful
     * without full offset resolution). Set at auto-billing time, then kept live — recomputed by
     * billing.service.ts's recomputePendingEstimates whenever this meter group's rate_ema chain
     * changes (a new cycle, a PATCH rate correction, or a gamma backfill), for as long as this
     * billing has no closed BillingCycle referencing it yet. Once a cycle picks it up, it stops
     * being "pending" and this field is no longer touched.
     */
    estimated_cost: number | null;
}
