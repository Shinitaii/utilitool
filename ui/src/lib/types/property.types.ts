import type { BaseModel } from './api.types';

export interface MeterGroupEntry {
  meter_group_id: string;
  is_main_meter: boolean;
}

export interface Property extends BaseModel {
  room_name: string;
  tenant_amount: number;
  meter_groups: Record<string, MeterGroupEntry | string>; // utility_type → {meter_group_id, is_main_meter} or string for backward compatibility
}

export interface CreatePropertyRequest {
  room_name: string;
  tenant_amount: number;
  meter_groups: Record<string, MeterGroupEntry>; // must include "electricity" and "water"
}

export interface UpdatePropertyRequest {
  room_name?: string;
  tenant_amount?: number;
  meter_groups?: Record<string, MeterGroupEntry>;
}
