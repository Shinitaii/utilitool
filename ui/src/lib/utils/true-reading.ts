import type { MeterGroup, MeterGroupVersionEntry } from '$lib/types/meter-group.types';
import type { MeterGroupEntry, Property } from '$lib/types/property.types';
import type { Reading } from '$lib/types/reading.types';

// Mirrors the API's resolveVersionsSource (reading.util.ts): submeter properties
// track their own reset history on Property.meter_groups[entry], not on the
// MeterGroup itself (that field is deprecated). Main-meter properties keep
// resolving from the MeterGroup.
export function getVersionsSource(
  meterGroup: MeterGroup | undefined,
  property: Property | undefined,
  meterGroupId: string
): Record<string, MeterGroupVersionEntry> | undefined {
  let versionsSource = meterGroup?.versions;
  if (property) {
    const entry = Object.values(property.meter_groups).find(
      (e): e is MeterGroupEntry => typeof e === 'object' && e?.meter_group_id === meterGroupId
    );
    if (entry && !entry.is_main_meter) {
      versionsSource = entry.versions;
    }
  }
  return versionsSource;
}

// Sum of `last_reading` for every version prior to `version` — the cumulative
// offset a reading's raw amount needs to become a "true" (all-time) total.
export function getCumulativeOffset(
  versions: Record<string, MeterGroupVersionEntry> | undefined,
  version: number
): number {
  if (!versions) return 0;
  let offset = 0;
  for (let v = 1; v < version; v++) {
    const versionData = versions[String(v)];
    if (versionData) offset += versionData.last_reading;
  }
  return offset;
}

export function trueReading(
  reading: Reading,
  meterGroup: MeterGroup | undefined,
  property: Property | undefined
): number {
  const versionsSource = getVersionsSource(meterGroup, property, reading.meter_group_id);
  return getCumulativeOffset(versionsSource, reading.meter_version ?? 1) + reading.reading_amount;
}

// Resolves the meter_version a NEW reading for this property/meter-group would
// be assigned, mirroring the API's resolveMeterVersion: submeter properties use
// their own entry's current_version, main meters use the MeterGroup's.
export function resolveCurrentVersion(
  meterGroup: MeterGroup | undefined,
  property: Property | undefined,
  meterGroupId: string
): number {
  if (property) {
    const entry = Object.values(property.meter_groups).find(
      (e): e is MeterGroupEntry => typeof e === 'object' && e?.meter_group_id === meterGroupId
    );
    if (entry && !entry.is_main_meter) {
      return entry.current_version ?? 1;
    }
  }
  return meterGroup?.current_version ?? 1;
}
