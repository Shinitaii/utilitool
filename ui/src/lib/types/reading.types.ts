import type { BaseModel, FirestoreTimestamp } from './api.types';

export interface Reading extends BaseModel {
  meter_group_id: string;
  reading_amount: number;
  reading_date: FirestoreTimestamp;
}

export interface CreateReadingRequest {
  meter_group_id: string;
  reading_amount: number;
  reading_date: FirestoreTimestamp | string;
}

export interface UpdateReadingRequest {
  meter_group_id?: string;
  reading_amount?: number;
  reading_date?: FirestoreTimestamp | string;
}
