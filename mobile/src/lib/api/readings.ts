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

export async function listReadings(meterGroupId?: string) {
  const params = new URLSearchParams();
  if (meterGroupId) params.append('meterGroupId', meterGroupId);
  return apiGet(`/readings${params.toString() ? '?' + params.toString() : ''}`);
}

export async function createReading(data: CreateReadingRequest) {
  return apiPost('/readings', data);
}

export async function createReadingsBatch(data: BatchReadingRequest) {
  return apiPost('/readings/batch', data);
}
