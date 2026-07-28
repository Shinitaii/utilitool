import type { BaseModel, FirestoreTimestamp } from './api.types';

export interface BillingCycle extends BaseModel {
	meter_group_id: string;
	billing_ids: Record<string, number>;
	billing_rate: number;
	billing_consumption: number;
	billing_start_date: FirestoreTimestamp;
	billing_end_date: FirestoreTimestamp;
	overdue_date?: FirestoreTimestamp;
	/** Exponential moving average of billing_rate for this meter group, as of this cycle. */
	rate_ema?: number;
}

export interface CreateBillingCycleRequest {
	meter_group_id?: string;
	billing_ids: Record<string, number>;
	billing_rate: number;
	billing_consumption: number;
	billing_start_date: FirestoreTimestamp | string;
	billing_end_date: FirestoreTimestamp | string;
	overdue_date?: FirestoreTimestamp | string;
}

export type UpdateBillingCycleRequest = Partial<CreateBillingCycleRequest>;
