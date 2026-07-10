import { apiGet, apiPost, apiPatch, apiDelete } from './client';
import type {
	Reading,
	CreateReadingRequest,
	CreateSeedReadingRequest,
	UpdateReadingRequest
} from '$lib/types/reading.types';
import type { PaginatedResult, BatchCreateResult } from '$lib/types/api.types';

export async function getReadings(params?: {
	meterGroupId?: string;
	propertyId?: string;
	startDate?: string;
	endDate?: string;
	limit?: number;
	cursor?: string;
	archived?: boolean;
}): Promise<PaginatedResult<Reading>> {
	const query = new URLSearchParams();
	if (params?.meterGroupId) query.set('meterGroupId', params.meterGroupId);
	if (params?.propertyId) query.set('propertyId', params.propertyId);
	if (params?.startDate) query.set('startDate', params.startDate);
	if (params?.endDate) query.set('endDate', params.endDate);
	if (params?.limit) query.set('limit', params.limit.toString());
	if (params?.cursor) query.set('cursor', params.cursor);
	if (params?.archived) query.set('archived', 'true');

	const path = query.toString() ? `/readings?${query}` : '/readings';
	return apiGet<PaginatedResult<Reading>>(path);
}

export async function getReadingById(id: string): Promise<Reading> {
	return apiGet<Reading>(`/readings/${id}`);
}

export async function createReading(data: CreateReadingRequest): Promise<Reading> {
	return apiPost<Reading>('/readings', data);
}

export async function createReadingsBatch(
	data: CreateReadingRequest[]
): Promise<BatchCreateResult<Reading>> {
	return apiPost<BatchCreateResult<Reading>>('/readings/batch', data);
}

export async function createSeedReading(data: CreateSeedReadingRequest): Promise<Reading> {
	return apiPost<Reading>('/readings/seed', data);
}

export async function updateReading(id: string, data: UpdateReadingRequest): Promise<Reading> {
	return apiPatch<Reading>(`/readings/${id}`, data);
}

export async function updateReadingsBatch(
	data: { id: string; data: UpdateReadingRequest }[]
): Promise<Reading[]> {
	return apiPatch<Reading[]>('/readings/batch', data);
}

export async function softDeleteReading(id: string): Promise<Reading> {
	return apiDelete<Reading>(`/readings/${id}`);
}

export async function restoreReading(id: string): Promise<Reading> {
	return apiPatch<Reading>(`/readings/${id}/restore`, {});
}

export async function ocrReadingImage(
	imageUrl: string
): Promise<{ suggested_reading_amount: number | null }> {
	return apiPost<{ suggested_reading_amount: number | null }>('/readings/ocr', {
		image_url: imageUrl
	});
}

export async function clearCache(): Promise<{ message: string }> {
	return apiPost<{ message: string }>('/readings/cache/clear', {});
}
