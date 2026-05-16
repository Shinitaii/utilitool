import type { BaseModel, FirestoreTimestamp } from './api.types';

export interface BillingCycle extends BaseModel {
  billing_ids: Record<string, number>;
  billing_rate: number;
  billing_consumption: number;
  billing_start_date: FirestoreTimestamp;
  billing_end_date: FirestoreTimestamp;
}

export interface CreateBillingCycleRequest {
  billing_ids: Record<string, number>;
  billing_rate: number;
  billing_consumption: number;
  billing_start_date: FirestoreTimestamp | string;
  billing_end_date: FirestoreTimestamp | string;
}

export interface UpdateBillingCycleRequest {
  billing_ids?: Record<string, number>;
  billing_rate?: number;
  billing_consumption?: number;
  billing_start_date?: FirestoreTimestamp | string;
  billing_end_date?: FirestoreTimestamp | string;
}
