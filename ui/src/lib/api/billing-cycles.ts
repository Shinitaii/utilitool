import { apiGet, apiPost, apiPut, apiDelete } from './client';
import type {
  BillingCycle,
  CreateBillingCycleRequest,
  UpdateBillingCycleRequest
} from '$lib/types/billing-cycle.types';
import type { PaginatedResult } from '$lib/types/api.types';

export async function getBillingCycles(params?: {
  billingStartDate?: string;
  billingEndDate?: string;
  limit?: number;
  cursor?: string;
}): Promise<PaginatedResult<BillingCycle>> {
  const query = new URLSearchParams();
  if (params?.billingStartDate) query.set('billingStartDate', params.billingStartDate);
  if (params?.billingEndDate) query.set('billingEndDate', params.billingEndDate);
  if (params?.limit) query.set('limit', params.limit.toString());
  if (params?.cursor) query.set('cursor', params.cursor);

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
): Promise<BillingCycle[]> {
  return apiPost<BillingCycle[]>('/billing-cycles/batch', data);
}

export async function updateBillingCycle(
  id: string,
  data: UpdateBillingCycleRequest
): Promise<BillingCycle> {
  return apiPut<BillingCycle>(`/billing-cycles/${id}`, data);
}

export async function updateBillingCyclesBatch(
  data: { id: string; data: UpdateBillingCycleRequest }[]
): Promise<BillingCycle[]> {
  return apiPut<BillingCycle[]>('/billing-cycles/batch', data);
}

export async function deleteBillingCycle(id: string): Promise<void> {
  return apiDelete<void>(`/billing-cycles/${id}`);
}

export async function softDeleteBillingCycle(id: string): Promise<BillingCycle> {
  return apiDelete<BillingCycle>(`/billing-cycles/soft/${id}`);
}
