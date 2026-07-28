import { apiGet, apiPost, buildQueryString } from './client';

export interface Reading {
  id: string;
  meter_group_id: string;
  property_id: string;
  reading_amount: number;
  reading_date: string;
  meter_version: number;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

export interface CreateReadingRequest {
  meter_group_id: string;
  property_id: string;
  reading_amount: number;
  reading_date: string;
}

export interface BatchReadingRequest {
  readings: CreateReadingRequest[];
}

export interface BatchCreateResult<T> {
  created: T[];
  failed: { index: number; error: string }[];
}

export interface ReadingsListResponse {
  data: Reading[];
  nextCursor?: string | null;
  hasMore: boolean;
}

export async function listReadings(options?: {
  meterGroupId?: string;
  limit?: number;
  offset?: number;
}): Promise<ReadingsListResponse> {
  return apiGet<ReadingsListResponse>(`/readings${buildQueryString(options)}`);
}

export async function getReading(id: string): Promise<Reading> {
  return apiGet<Reading>(`/readings/${id}`);
}

export async function createReadingsBatch(data: BatchReadingRequest): Promise<BatchCreateResult<Reading>> {
  if (!data.readings || data.readings.length === 0) {
    throw new Error('Cannot submit an empty batch — add at least one reading.');
  }
  return apiPost<BatchCreateResult<Reading>>('/readings/batch', data);
}

export async function createSeedReading(data: CreateReadingRequest): Promise<Reading> {
  return apiPost<Reading>('/readings/seed', data);
}

export async function ocrReadingImage(
  imageUrl: string
): Promise<{ suggested_reading_amount: number | null }> {
  return apiPost<{ suggested_reading_amount: number | null }>('/readings/ocr', { image_url: imageUrl });
}
