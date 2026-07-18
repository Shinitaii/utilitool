import { apiGet, apiPost, apiPatch, apiDelete } from './client';
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
	const query = new URLSearchParams();
	if (params?.propertyId) query.set('propertyId', params.propertyId);
	if (params?.meterGroupId) query.set('meterGroupId', params.meterGroupId);
	if (params?.startDate) query.set('startDate', params.startDate);
	if (params?.endDate) query.set('endDate', params.endDate);
	if (params?.limit) query.set('limit', params.limit.toString());
	if (params?.cursor) query.set('cursor', params.cursor);
	if (params?.archived) query.set('archived', 'true');

	const path = query.toString() ? `/billings?${query}` : '/billings';
	return apiGet<PaginatedResult<Billing>>(path);
}

export async function getBillingById(id: string): Promise<Billing> {
	return apiGet<Billing>(`/billings/${id}`);
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
