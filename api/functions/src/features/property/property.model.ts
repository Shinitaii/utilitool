import {BaseModel} from "../../utils/model.util";

export interface MeterGroupEntry {
  meter_group_id: string;
  is_main_meter: boolean;
}

export interface Property extends BaseModel {
  room_name: string;
  tenant_amount: number;
  meter_groups: Record<string, MeterGroupEntry>;
}
