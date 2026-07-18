import { apiGet } from './client';

export interface MeterGroup {
  id: string;
  meter_name: string;
  utility_type: string;
  current_version: number;
  versions: Record<string, { reset_at: string; last_reading: number }>;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

export async function listMeterGroups() {
  return apiGet('/meter-groups?summary=true');
}
