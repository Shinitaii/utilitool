import { apiGet, apiPost, apiPatch, apiDelete } from './client';
import type {
	BillingCycle,
	CreateBillingCycleRequest,
	UpdateBillingCycleRequest
} from '$lib/types/billing-cycle.types';
import type { PaginatedResult, BatchCreateResult } from '$lib/types/api.types';

export async function getBillingCycles(params?: {
	billingStartDate?: string;
	billingEndDate?: string;
	limit?: number;
	cursor?: string;
	archived?: boolean;
}): Promise<PaginatedResult<BillingCycle>> {
	const query = new URLSearchParams();
	if (params?.billingStartDate) query.set('billingStartDate', params.billingStartDate);
	if (params?.billingEndDate) query.set('billingEndDate', params.billingEndDate);
	if (params?.limit) query.set('limit', params.limit.toString());
	if (params?.cursor) query.set('cursor', params.cursor);
	if (params?.archived) query.set('archived', 'true');

	const path = query.toString() ? `/billing-cycles?${query}` : '/billing-cycles';
	return apiGet<PaginatedResult<BillingCycle>>(path);
}

export async function getBillingCycleById(id: string): Promise<BillingCycle> {
	return apiGet<BillingCycle>(`/billing-cycles/${id}`);
}

export async function createBillingCycle(data: CreateBillingCycleRequest): Promise<BillingCycle> {
	return apiPost<BillingCycle>('/billing-cycles', data);
}

export async function createBillingCyclesBatch(
	data: CreateBillingCycleRequest[]
): Promise<BatchCreateResult<BillingCycle>> {
	return apiPost<BatchCreateResult<BillingCycle>>('/billing-cycles/batch', data);
}

export async function updateBillingCycle(
	id: string,
	data: UpdateBillingCycleRequest
): Promise<BillingCycle> {
	return apiPatch<BillingCycle>(`/billing-cycles/${id}`, data);
}

export async function updateBillingCyclesBatch(
	data: { id: string; data: UpdateBillingCycleRequest }[]
): Promise<BillingCycle[]> {
	return apiPatch<BillingCycle[]>('/billing-cycles/batch', data);
}

export async function deleteBillingCycle(id: string): Promise<void> {
	return apiDelete<void>(`/billing-cycles/${id}`);
}

export async function softDeleteBillingCycle(id: string): Promise<BillingCycle> {
	return apiDelete<BillingCycle>(`/billing-cycles/${id}`);
}

export async function restoreBillingCycle(id: string): Promise<BillingCycle> {
	return apiPatch<BillingCycle>(`/billing-cycles/${id}/restore`, {});
}

export interface BillingCycleOcrResult {
	billing_start_date: string;
	billing_end_date: string;
	billing_consumption: number;
	billing_rate: number;
	raw_amount: number;
}

export async function ocrBillingCycle(imageUrl: string): Promise<BillingCycleOcrResult> {
	return apiPost<BillingCycleOcrResult>('/billing-cycles/ocr', { image_url: imageUrl });
}

export async function clearCache(): Promise<{ message: string }> {
	return apiPost<{ message: string }>('/billing-cycles/cache/clear', {});
}
