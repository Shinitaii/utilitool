import { apiGet, apiPost, apiPatch, apiDelete, toQueryString } from './client';
import type { Billing, CreateBillingRequest, UpdateBillingRequest } from '$lib/types/billing.types';
import type { PaginatedResult } from '$lib/types/api.types';

export async function getBillings(params?: {
	propertyId?: string;
	meterGroupId?: string;
	startDate?: string;
	endDate?: string;
	limit?: number;
	cursor?: string;
	archived?: boolean;
}): Promise<PaginatedResult<Billing>> {
	return apiGet<PaginatedResult<Billing>>(`/billings${toQueryString(params)}`);
}

export async function getBillingById(id: string): Promise<Billing> {
	return apiGet<Billing>(`/billings/${id}`);
}

export async function getBillingsByIds(ids: string[]): Promise<Billing[]> {
	return apiGet<Billing[]>(`/billings/batch-get?ids=${ids.map(encodeURIComponent).join(',')}`);
}

export async function createBilling(data: CreateBillingRequest): Promise<Billing> {
	return apiPost<Billing>('/billings', data);
}

export async function createBillingsBatch(data: CreateBillingRequest[]): Promise<Billing[]> {
	return apiPost<Billing[]>('/billings/batch', data);
}

export async function updateBilling(id: string, data: UpdateBillingRequest): Promise<Billing> {
	return apiPatch<Billing>(`/billings/${id}`, data);
}

export async function updateBillingsBatch(
	data: { id: string; data: UpdateBillingRequest }[]
): Promise<Billing[]> {
	return apiPatch<Billing[]>('/billings/batch', data);
}

export async function softDeleteBilling(id: string): Promise<Billing> {
	return apiDelete<Billing>(`/billings/${id}`);
}

export async function restoreBilling(id: string): Promise<Billing> {
	return apiPatch<Billing>(`/billings/${id}/restore`, {});
}

export async function clearCache(): Promise<{ message: string }> {
	return apiPost<{ message: string }>('/billings/cache/clear', {});
}
