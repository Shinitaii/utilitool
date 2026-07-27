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
  // Derived, denormalized from meter_groups: the meter_group_ids this property is the main
  // meter for (usually empty, occasionally one entry). Kept in sync at write time by
  // property.service.ts so targeted array-contains queries can replace full-collection scans
  // for main-meter lookups — see decisions/20260719_billing-meter-group-denormalization.md for
  // the precedent (Billing.meter_group_id) and decisions/20260726_data-retrieval-layer-
  // modularization.md for why this field exists.
  main_meter_group_ids: string[];
}
