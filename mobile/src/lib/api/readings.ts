import { apiGet, apiPost } from './client';

export interface Reading {
  id: string;
  meter_group_id: string;
  property_id: string;
  reading_amount: number;
  reading_date: string;
  image_url?: string;
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
  image_url?: string;
}

export interface BatchReadingRequest {
  readings: CreateReadingRequest[];
}

export interface BatchCreateResult<T> {
  created: T[];
  failed: { index: number; error: string }[];
}

export async function listReadings(options?: {
  meterGroupId?: string;
  limit?: number;
  offset?: number;
}) {
  const params = new URLSearchParams();
  if (options?.meterGroupId) params.append('meterGroupId', options.meterGroupId);
  if (options?.limit) params.append('limit', String(options.limit));
  if (options?.offset) params.append('offset', String(options.offset));
  return apiGet(`/readings${params.toString() ? '?' + params.toString() : ''}`);
}

export async function getReading(id: string): Promise<Reading> {
  return apiGet(`/readings/${id}`);
}

export async function createReading(data: CreateReadingRequest) {
  return apiPost('/readings', data);
}

export async function createReadingsBatch(data: BatchReadingRequest): Promise<BatchCreateResult<Reading>> {
  if (!data.readings || data.readings.length === 0) {
    throw new Error('Cannot submit an empty batch — add at least one reading.');
  }
  return apiPost('/readings/batch', data);
}

export async function createSeedReading(data: CreateReadingRequest) {
  return apiPost('/readings/seed', data);
}

export async function ocrReadingImage(
  imageUrl: string
): Promise<{ suggested_reading_amount: number | null }> {
  return apiPost('/readings/ocr', { image_url: imageUrl });
}
