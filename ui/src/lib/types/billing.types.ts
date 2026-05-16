import type { BaseModel } from './api.types';

export interface Billing extends BaseModel {
  property_id: string;
  previous_reading_id: string;
  current_reading_id: string;
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
}
