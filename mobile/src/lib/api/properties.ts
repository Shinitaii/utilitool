import { apiGet } from './client';

export interface MeterGroupEntry {
  meter_group_id: string;
  is_main_meter: boolean;
}

export interface Property {
  id: string;
  room_name: string;
  tenant_amount: number;
  meter_groups: Record<string, MeterGroupEntry>;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

export async function listProperties() {
  return apiGet('/properties');
}

export async function getProperty(id: string) {
  return apiGet(`/properties/${id}`);
}
