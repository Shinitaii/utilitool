import { apiGet, apiPost, apiPatch, apiDelete, toQueryString } from './client';
import type {
	MeterGroup,
	CreateMeterGroupRequest,
	UpdateMeterGroupRequest
} from '$lib/types/meter-group.types';
import type { PaginatedResult } from '$lib/types/api.types';

export async function getMeterGroups(params?: {
	meterName?: string;
	utilityType?: string;
	limit?: number;
	cursor?: string;
	minimal?: boolean;
	archived?: boolean;
}): Promise<PaginatedResult<MeterGroup>> {
	return apiGet<PaginatedResult<MeterGroup>>(`/meter-groups${toQueryString(params)}`);
}

export async function getMeterGroupById(id: string): Promise<MeterGroup> {
	return apiGet<MeterGroup>(`/meter-groups/${id}`);
}

export async function createMeterGroup(data: CreateMeterGroupRequest): Promise<MeterGroup> {
	return apiPost<MeterGroup>('/meter-groups', data);
}

export async function createMeterGroupsBatch(
	data: CreateMeterGroupRequest[]
): Promise<MeterGroup[]> {
	return apiPost<MeterGroup[]>('/meter-groups/batch', data);
}

export async function updateMeterGroup(
	id: string,
	data: UpdateMeterGroupRequest
): Promise<MeterGroup> {
	return apiPatch<MeterGroup>(`/meter-groups/${id}`, data);
}

export async function updateMeterGroupsBatch(
	data: { id: string; data: UpdateMeterGroupRequest }[]
): Promise<MeterGroup[]> {
	return apiPatch<MeterGroup[]>('/meter-groups/batch', data);
}

export async function softDeleteMeterGroup(id: string): Promise<MeterGroup> {
	return apiDelete<MeterGroup>(`/meter-groups/${id}`);
}

export async function restoreMeterGroup(id: string): Promise<MeterGroup> {
	return apiPatch<MeterGroup>(`/meter-groups/${id}/restore`, {});
}

export async function recordMeterGroupReset(id: string): Promise<MeterGroup> {
	return apiPost<MeterGroup>(`/meter-groups/${id}/reset`, {});
}

export async function clearCache(): Promise<{ message: string }> {
	return apiPost<{ message: string }>('/meter-groups/cache/clear', {});
}
