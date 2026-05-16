import { apiGet, apiPost, apiPut, apiDelete } from './client';
import type { Property, CreatePropertyRequest, UpdatePropertyRequest } from '$lib/types/property.types';
import type { PaginatedResult } from '$lib/types/api.types';

export async function getProperties(params?: {
  roomName?: string;
  meterGroupId?: string;
  limit?: number;
  cursor?: string;
}): Promise<PaginatedResult<Property>> {
  const query = new URLSearchParams();
  if (params?.roomName) query.set('roomName', params.roomName);
  if (params?.meterGroupId) query.set('meterGroupId', params.meterGroupId);
  if (params?.limit) query.set('limit', params.limit.toString());
  if (params?.cursor) query.set('cursor', params.cursor);

  const path = query.toString() ? `/properties?${query}` : '/properties';
  return apiGet<PaginatedResult<Property>>(path);
}

export async function getPropertyById(id: string): Promise<Property> {
  return apiGet<Property>(`/properties/${id}`);
}

export async function createProperty(data: CreatePropertyRequest): Promise<Property> {
  return apiPost<Property>('/properties', data);
}

export async function createPropertiesBatch(data: CreatePropertyRequest[]): Promise<Property[]> {
  return apiPost<Property[]>('/properties/batch', data);
}

export async function updateProperty(id: string, data: UpdatePropertyRequest): Promise<Property> {
  return apiPut<Property>(`/properties/${id}`, data);
}

export async function updatePropertiesBatch(
  data: { id: string; data: UpdatePropertyRequest }[]
): Promise<Property[]> {
  return apiPut<Property[]>('/properties/batch', data);
}

export async function deleteProperty(id: string): Promise<void> {
  return apiDelete<void>(`/properties/${id}`);
}

export async function softDeleteProperty(id: string): Promise<Property> {
  return apiDelete<Property>(`/properties/soft/${id}`);
}
