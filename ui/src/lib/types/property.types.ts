import type { BaseModel } from './api.types';

export interface Property extends BaseModel {
  room_name: string;
  tenant_amount: number;
  meter_group_id: string;
}

export interface CreatePropertyRequest {
  room_name: string;
  tenant_amount: number;
  meter_group_id: string;
}

export interface UpdatePropertyRequest {
  room_name?: string;
  tenant_amount?: number;
  meter_group_id?: string;
}
