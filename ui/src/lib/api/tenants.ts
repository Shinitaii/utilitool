import { apiGet, apiPost, apiPut, apiDelete } from './client';
import type { Tenant, CreateTenantRequest, UpdateTenantRequest } from '$lib/types/tenant.types';
import type { PaginatedResult } from '$lib/types/api.types';

export async function getTenants(params?: {
  tenantName?: string;
  propertyId?: string;
  limit?: number;
  cursor?: string;
}): Promise<PaginatedResult<Tenant>> {
  const query = new URLSearchParams();
  if (params?.tenantName) query.set('tenantName', params.tenantName);
  if (params?.propertyId) query.set('propertyId', params.propertyId);
  if (params?.limit) query.set('limit', params.limit.toString());
  if (params?.cursor) query.set('cursor', params.cursor);

  const path = query.toString() ? `/tenants?${query}` : '/tenants';
  return apiGet<PaginatedResult<Tenant>>(path);
}

export async function getTenantById(id: string): Promise<Tenant> {
  return apiGet<Tenant>(`/tenants/${id}`);
}

export async function createTenant(data: CreateTenantRequest): Promise<Tenant> {
  return apiPost<Tenant>('/tenants', data);
}

export async function createTenantsBatch(data: CreateTenantRequest[]): Promise<Tenant[]> {
  return apiPost<Tenant[]>('/tenants/batch', data);
}

export async function updateTenant(id: string, data: UpdateTenantRequest): Promise<Tenant> {
  return apiPut<Tenant>(`/tenants/${id}`, data);
}

export async function updateTenantsBatch(
  data: { id: string; data: UpdateTenantRequest }[]
): Promise<Tenant[]> {
  return apiPut<Tenant[]>('/tenants/batch', data);
}

export async function deleteTenant(id: string): Promise<void> {
  return apiDelete<void>(`/tenants/${id}`);
}

export async function softDeleteTenant(id: string): Promise<Tenant> {
  return apiDelete<Tenant>(`/tenants/soft/${id}`);
}
