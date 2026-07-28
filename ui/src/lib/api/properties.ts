import { apiPost } from './client';
import { createCrudApi } from './crud-api-factory';
import type {
	Property,
	CreatePropertyRequest,
	UpdatePropertyRequest
} from '$lib/types/property.types';

interface GetPropertiesParams {
	roomName?: string;
	meterGroupId?: string;
	limit?: number;
	cursor?: string;
	archived?: boolean;
}

const propertiesApi = createCrudApi<
	Property,
	CreatePropertyRequest,
	UpdatePropertyRequest,
	GetPropertiesParams
>('/properties');

export const getProperties = propertiesApi.get;
export const getPropertyById = propertiesApi.getById;
export const createProperty = propertiesApi.create;
export const createPropertiesBatch = propertiesApi.createBatch;
export const updateProperty = propertiesApi.update;
export const updatePropertiesBatch = propertiesApi.updateBatch;
export const softDeleteProperty = propertiesApi.softDelete;
export const restoreProperty = propertiesApi.restore;
export const clearCache = propertiesApi.clearCache;

export async function recordPropertyMeterGroupReset(
	propertyId: string,
	meterGroupId: string
): Promise<Property> {
	return apiPost<Property>(`/properties/${propertyId}/meter-groups/${meterGroupId}/reset`, {});
}
