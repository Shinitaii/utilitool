import {Timestamp} from "firebase-admin/firestore";
import {UtilityType} from "../../constants/utility.constants";
import {BaseModel} from "../../utils/model.util";

export interface MeterGroupVersionEntry {
  reset_at: Timestamp;
  last_reading: number;
}

export interface MeterGroup extends BaseModel {
  meter_name: string;
  utility_type: UtilityType;
  current_version: number;
  versions: Record<string, MeterGroupVersionEntry>;
}
