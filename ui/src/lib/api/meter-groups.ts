import { apiGet, apiPost, apiPatch, apiDelete } from './client';
import type { MeterGroup, CreateMeterGroupRequest, UpdateMeterGroupRequest } from '$lib/types/meter-group.types';
import type { PaginatedResult } from '$lib/types/api.types';

export async function getMeterGroups(params?: {
  meterName?: string;
  utilityType?: string;
  limit?: number;
  cursor?: string;
  minimal?: boolean;
  archived?: boolean;
}): Promise<PaginatedResult<MeterGroup>> {
  const query = new URLSearchParams();
  if (params?.meterName) query.set('meterName', params.meterName);
  if (params?.utilityType) query.set('utilityType', params.utilityType);
  if (params?.limit) query.set('limit', params.limit.toString());
  if (params?.cursor) query.set('cursor', params.cursor);
  if (params?.minimal) query.set('minimal', 'true');
  if (params?.archived) query.set('archived', 'true');

  const path = query.toString() ? `/meter-groups?${query}` : '/meter-groups';
  return apiGet<PaginatedResult<MeterGroup>>(path);
}

export async function getMeterGroupById(id: string): Promise<MeterGroup> {
  return apiGet<MeterGroup>(`/meter-groups/${id}`);
}

export async function createMeterGroup(data: CreateMeterGroupRequest): Promise<MeterGroup> {
  return apiPost<MeterGroup>('/meter-groups', data);
}

export async function createMeterGroupsBatch(data: CreateMeterGroupRequest[]): Promise<MeterGroup[]> {
  return apiPost<MeterGroup[]>('/meter-groups/batch', data);
}

export async function updateMeterGroup(id: string, data: UpdateMeterGroupRequest): Promise<MeterGroup> {
  return apiPatch<MeterGroup>(`/meter-groups/${id}`, data);
}

export async function updateMeterGroupsBatch(
  data: { id: string; data: UpdateMeterGroupRequest }[]
): Promise<MeterGroup[]> {
  return apiPatch<MeterGroup[]>('/meter-groups/batch', data);
}

export async function deleteMeterGroup(id: string): Promise<void> {
  return apiDelete<void>(`/meter-groups/${id}`);
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
