import type { BaseModel, FirestoreTimestamp } from './api.types';

export type UtilityType = 'electricity' | 'water';

export interface MeterGroupVersionEntry {
	reset_at: FirestoreTimestamp;
	last_reading: number;
}

export interface MeterGroup extends BaseModel {
	meter_name: string;
	utility_type: UtilityType;
	current_version: number;
	versions: Record<string, MeterGroupVersionEntry>;
}

export interface CreateMeterGroupRequest {
	meter_name: string;
	utility_type: UtilityType;
}

export interface UpdateMeterGroupRequest {
	meter_name?: string;
	utility_type?: UtilityType;
}
