import { apiPost } from './client';
import { createCrudApi } from './crud-api-factory';
import type {
	MeterGroup,
	CreateMeterGroupRequest,
	UpdateMeterGroupRequest
} from '$lib/types/meter-group.types';

interface GetMeterGroupsParams {
	meterName?: string;
	utilityType?: string;
	limit?: number;
	cursor?: string;
	minimal?: boolean;
	archived?: boolean;
}

const meterGroupsApi = createCrudApi<
	MeterGroup,
	CreateMeterGroupRequest,
	UpdateMeterGroupRequest,
	GetMeterGroupsParams
>('/meter-groups');

export const getMeterGroups = meterGroupsApi.get;
export const getMeterGroupById = meterGroupsApi.getById;
export const createMeterGroup = meterGroupsApi.create;
export const createMeterGroupsBatch = meterGroupsApi.createBatch;
export const updateMeterGroup = meterGroupsApi.update;
export const updateMeterGroupsBatch = meterGroupsApi.updateBatch;
export const softDeleteMeterGroup = meterGroupsApi.softDelete;
export const restoreMeterGroup = meterGroupsApi.restore;
export const clearCache = meterGroupsApi.clearCache;

export async function recordMeterGroupReset(id: string): Promise<MeterGroup> {
	return apiPost<MeterGroup>(`/meter-groups/${id}/reset`, {});
}
