import type { BaseModel, FirestoreTimestamp } from './api.types';

export interface Reading extends BaseModel {
  meter_group_id: string;
  property_id: string;
  reading_amount: number;
  reading_date: FirestoreTimestamp;
  image_url?: string;
  meter_version: number;
}

export interface CreateReadingRequest {
  meter_group_id: string;
  property_id: string;
  reading_amount: number;
  reading_date: FirestoreTimestamp | string;
  image_url?: string;
}

export interface CreateSeedReadingRequest {
  meter_group_id: string;
  property_id: string;
  reading_amount: number;
  reading_date: FirestoreTimestamp | string;
  image_url?: string;
}

export interface UpdateReadingRequest {
  meter_group_id?: string;
  reading_amount?: number;
  reading_date?: FirestoreTimestamp | string;
  image_url?: string;
}
