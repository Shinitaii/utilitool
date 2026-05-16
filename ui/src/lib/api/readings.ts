import { apiGet, apiPost, apiPut, apiDelete } from './client';
import type { Reading, CreateReadingRequest, UpdateReadingRequest } from '$lib/types/reading.types';
import type { PaginatedResult } from '$lib/types/api.types';

export async function getReadings(params?: {
  meterGroupId?: string;
  limit?: number;
  cursor?: string;
}): Promise<PaginatedResult<Reading>> {
  const query = new URLSearchParams();
  if (params?.meterGroupId) query.set('meterGroupId', params.meterGroupId);
  if (params?.limit) query.set('limit', params.limit.toString());
  if (params?.cursor) query.set('cursor', params.cursor);

  const path = query.toString() ? `/readings?${query}` : '/readings';
  return apiGet<PaginatedResult<Reading>>(path);
}

export async function getReadingById(id: string): Promise<Reading> {
  return apiGet<Reading>(`/readings/${id}`);
}

export async function createReading(data: CreateReadingRequest): Promise<Reading> {
  return apiPost<Reading>('/readings', {
    ...data,
    reading_date: typeof data.reading_date === 'string' ? data.reading_date : data.reading_date
  });
}

export async function createReadingsBatch(data: CreateReadingRequest[]): Promise<Reading[]> {
  return apiPost<Reading[]>('/readings/batch', data);
}

export async function updateReading(id: string, data: UpdateReadingRequest): Promise<Reading> {
  return apiPut<Reading>(`/readings/${id}`, data);
}

export async function updateReadingsBatch(
  data: { id: string; data: UpdateReadingRequest }[]
): Promise<Reading[]> {
  return apiPut<Reading[]>('/readings/batch', data);
}

export async function deleteReading(id: string): Promise<void> {
  return apiDelete<void>(`/readings/${id}`);
}

export async function softDeleteReading(id: string): Promise<Reading> {
  return apiDelete<Reading>(`/readings/soft/${id}`);
}
