import type { BaseModel } from './api.types';

export interface Property extends BaseModel {
  room_name: string;
  tenant_amount: number;
  meter_groups: Record<string, string>; // utility_type → meter_group_id
}

export interface CreatePropertyRequest {
  room_name: string;
  tenant_amount: number;
  meter_groups: Record<string, string>; // must include "electricity" and "water"
}

export interface UpdatePropertyRequest {
  room_name?: string;
  tenant_amount?: number;
  meter_groups?: Record<string, string>;
}
