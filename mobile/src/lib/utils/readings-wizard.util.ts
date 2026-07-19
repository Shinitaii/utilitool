import type { Property, MeterGroupEntry } from '../api/properties';

export function findMeterGroupEntry(property: Property, meterGroupId: string): MeterGroupEntry | undefined {
  return Object.values(property.meter_groups).find((entry) => entry.meter_group_id === meterGroupId);
}

// Main-meter properties need a one-time baseline "seed" reading (POST /readings/seed)
// before they can take regular batch readings.
export function needsSeedReading(property: Property, meterGroupId: string): boolean {
  return findMeterGroupEntry(property, meterGroupId)?.is_main_meter === true;
}
