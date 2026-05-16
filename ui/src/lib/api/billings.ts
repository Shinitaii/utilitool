import { apiGet, apiPost, apiPut, apiDelete } from './client';
import type { Billing, CreateBillingRequest, UpdateBillingRequest } from '$lib/types/billing.types';
import type { PaginatedResult } from '$lib/types/api.types';

export async function getBillings(params?: {
  propertyId?: string;
  limit?: number;
  cursor?: string;
}): Promise<PaginatedResult<Billing>> {
  const query = new URLSearchParams();
  if (params?.propertyId) query.set('propertyId', params.propertyId);
  if (params?.limit) query.set('limit', params.limit.toString());
  if (params?.cursor) query.set('cursor', params.cursor);

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
  return apiPut<Billing>(`/billings/${id}`, data);
}

export async function updateBillingsBatch(
  data: { id: string; data: UpdateBillingRequest }[]
): Promise<Billing[]> {
  return apiPut<Billing[]>('/billings/batch', data);
}

export async function deleteBilling(id: string): Promise<void> {
  return apiDelete<void>(`/billings/${id}`);
}

export async function softDeleteBilling(id: string): Promise<Billing> {
  return apiDelete<Billing>(`/billings/soft/${id}`);
}
