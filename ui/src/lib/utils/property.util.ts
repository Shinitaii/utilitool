import type { MeterGroupEntry } from '$lib/types/property.types';

/** A property's `meter_groups[utilityType]` entry can be a MeterGroupEntry object or, for
 * backward compatibility, a bare meter-group-id string. */
export type PropertyMeterGroupEntry = MeterGroupEntry | string | undefined;

export function getMeterGroupId(entry: PropertyMeterGroupEntry): string | undefined {
	if (!entry) return undefined;
	return typeof entry === 'string' ? entry : entry.meter_group_id;
}

export function isMainMeterEntry(entry: PropertyMeterGroupEntry): boolean {
	if (!entry || typeof entry === 'string') return false;
	return entry.is_main_meter ?? false;
}
