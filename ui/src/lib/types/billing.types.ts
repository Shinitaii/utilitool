import type { BaseModel, FirestoreTimestamp } from './api.types';

export interface Billing extends BaseModel {
	property_id: string;
	previous_reading_id: string;
	current_reading_id: string;
	meter_group_id: string;
	billing_period_date: FirestoreTimestamp;
	payment_status: 'pending' | 'paid';
	paid_at?: string;
	/**
	 * Cost estimate (known consumption x the meter group's rate EMA), computed when the
	 * billing was auto-created — before the official billing cycle/rate lands. null on
	 * manually-created billings, cold-start meter groups with no cycle history yet, or
	 * readings that cross a meter-version reset. Frozen at creation.
	 */
	estimated_cost: number | null;
}

export interface CreateBillingRequest {
	property_id: string;
	previous_reading_id: string;
	current_reading_id: string;
}

export interface UpdateBillingRequest {
	property_id?: string;
	previous_reading_id?: string;
	current_reading_id?: string;
	payment_status?: 'pending' | 'paid';
	paid_at?: string;
}
