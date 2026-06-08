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
  /**
   * @deprecated Version tracking has moved to `Property.meter_groups[entry].current_version`.
   * Submeter entries already track their own versions independently; main-meter entries are
   * pending backfill (see `migrations/backfill-property-meter-versions.ts`). Do not write new
   * data here — read paths should resolve from the property entry once that backfill lands.
   */
  current_version: number;
  /**
   * @deprecated Version history has moved to `Property.meter_groups[entry].versions`.
   * See `current_version` deprecation note for migration status.
   */
  versions: Record<string, MeterGroupVersionEntry>;
}
