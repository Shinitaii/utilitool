import type { BaseModel } from './api.types';

export type UtilityType = 'electricity' | 'water';

export interface MeterGroup extends BaseModel {
  meter_name: string;
  utility_type: UtilityType;
}

export interface CreateMeterGroupRequest {
  meter_name: string;
  utility_type: UtilityType;
}

export interface UpdateMeterGroupRequest {
  meter_name?: string;
  utility_type?: UtilityType;
}
