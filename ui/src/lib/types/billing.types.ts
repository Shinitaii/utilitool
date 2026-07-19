import type { BaseModel, FirestoreTimestamp } from './api.types';

export interface Billing extends BaseModel {
	property_id: string;
	previous_reading_id: string;
	current_reading_id: string;
	meter_group_id: string;
	billing_period_date: FirestoreTimestamp;
	payment_status: 'pending' | 'paid';
	paid_at?: string;
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
