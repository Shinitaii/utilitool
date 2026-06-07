import {BaseModel} from "../../utils/model.util";
import {MeterGroupVersionEntry} from "../meter-group/meter-group.model";

export interface MeterGroupEntry {
  meter_group_id: string;
  is_main_meter: boolean;
  current_version?: number; // submeter-only; main-meter resolution stays on the meter group
  versions?: Record<string, MeterGroupVersionEntry>; // submeter-only; mirrors MeterGroup.versions
}

export interface Property extends BaseModel {
  room_name: string;
  tenant_amount: number;
  meter_groups: Record<string, MeterGroupEntry>;
}
