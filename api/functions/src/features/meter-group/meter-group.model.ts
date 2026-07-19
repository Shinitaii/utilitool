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
   * Deprecated FOR SUBMETERS ONLY — submeter version tracking moved to
   * `Property.meter_groups[entry].current_version`. For **main meters this is still the live,
   * required source of truth** for `Reading.meter_version`: `propertyService.recordMeterGroupReset`
   * rejects main-meter resets and routes them here, and `resolveVersionsSource`/`resolveMeterVersion`
   * read this field for main meters. The planned "migrate main meters too" backfill was never done
   * and is not pending — do NOT delete this field. See
   * `decisions/20260608_meter-group-version-tracking-moved-to-property.md` (Amendment 2026-07-19).
   */
  current_version: number;
  /**
   * Deprecated FOR SUBMETERS ONLY — see `current_version`. Still the live source of version history
   * for **main meters**; do not delete.
   */
  versions: Record<string, MeterGroupVersionEntry>;
}
