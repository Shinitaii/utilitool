import { apiGet, apiPost } from './client';
import { createCrudApi } from './crud-api-factory';
import type {
	Reading,
	CreateReadingRequest,
	CreateSeedReadingRequest,
	UpdateReadingRequest
} from '$lib/types/reading.types';
import type { BatchCreateResult } from '$lib/types/api.types';

interface GetReadingsParams {
	meterGroupId?: string;
	propertyId?: string;
	startDate?: string;
	endDate?: string;
	limit?: number;
	cursor?: string;
	archived?: boolean;
}

const readingsApi = createCrudApi<
	Reading,
	CreateReadingRequest,
	UpdateReadingRequest,
	GetReadingsParams,
	BatchCreateResult<Reading>
>('/readings');

export const getReadings = readingsApi.get;
export const getReadingById = readingsApi.getById;
export const createReading = readingsApi.create;
export const createReadingsBatch = readingsApi.createBatch;
export const updateReading = readingsApi.update;
export const updateReadingsBatch = readingsApi.updateBatch;
export const softDeleteReading = readingsApi.softDelete;
export const restoreReading = readingsApi.restore;
export const clearCache = readingsApi.clearCache;

export async function getReadingsByIds(ids: string[]): Promise<Reading[]> {
	return apiGet<Reading[]>(`/readings/batch-get?ids=${ids.map(encodeURIComponent).join(',')}`);
}

export async function createSeedReading(data: CreateSeedReadingRequest): Promise<Reading> {
	return apiPost<Reading>('/readings/seed', data);
}

export async function ocrReadingImage(
	imageUrl: string
): Promise<{ suggested_reading_amount: number | null }> {
	return apiPost<{ suggested_reading_amount: number | null }>('/readings/ocr', {
		image_url: imageUrl
	});
}
