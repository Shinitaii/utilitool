import { apiGet, apiPost, apiPatch, apiDelete, toQueryString } from './client';
import type { Tenant, CreateTenantRequest, UpdateTenantRequest } from '$lib/types/tenant.types';
import type { PaginatedResult } from '$lib/types/api.types';

export async function getTenants(params?: {
	tenantName?: string;
	propertyId?: string;
	limit?: number;
	cursor?: string;
	archived?: boolean;
}): Promise<PaginatedResult<Tenant>> {
	return apiGet<PaginatedResult<Tenant>>(`/tenants${toQueryString(params)}`);
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
	return apiPatch<Tenant>(`/tenants/${id}`, data);
}

export async function updateTenantsBatch(
	data: { id: string; data: UpdateTenantRequest }[]
): Promise<Tenant[]> {
	return apiPatch<Tenant[]>('/tenants/batch', data);
}

export async function softDeleteTenant(id: string): Promise<Tenant> {
	return apiDelete<Tenant>(`/tenants/${id}`);
}

export async function restoreTenant(id: string): Promise<Tenant> {
	return apiPatch<Tenant>(`/tenants/${id}/restore`, {});
}

export async function clearCache(): Promise<{ message: string }> {
	return apiPost<{ message: string }>('/tenants/cache/clear', {});
}
