import { createCrudApi } from './crud-api-factory';
import type { Tenant, CreateTenantRequest, UpdateTenantRequest } from '$lib/types/tenant.types';

interface GetTenantsParams {
	tenantName?: string;
	propertyId?: string;
	limit?: number;
	cursor?: string;
	archived?: boolean;
}

const tenantsApi = createCrudApi<
	Tenant,
	CreateTenantRequest,
	UpdateTenantRequest,
	GetTenantsParams
>('/tenants');

export const getTenants = tenantsApi.get;
export const getTenantById = tenantsApi.getById;
export const createTenant = tenantsApi.create;
export const createTenantsBatch = tenantsApi.createBatch;
export const updateTenant = tenantsApi.update;
export const updateTenantsBatch = tenantsApi.updateBatch;
export const softDeleteTenant = tenantsApi.softDelete;
export const restoreTenant = tenantsApi.restore;
export const clearCache = tenantsApi.clearCache;
