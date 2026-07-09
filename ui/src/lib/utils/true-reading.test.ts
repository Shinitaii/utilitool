import { describe, it, expect } from 'vitest';
import { trueReading, resolveCurrentVersion, getVersionsSource, getCumulativeOffset } from './true-reading';
import type { MeterGroup } from '$lib/types/meter-group.types';
import type { Property } from '$lib/types/property.types';
import type { Reading } from '$lib/types/reading.types';

const baseMeterGroup: MeterGroup = {
  id: 'mg-1',
  meter_name: 'Water Main',
  utility_type: 'water',
  current_version: 5, // stale/deprecated field — must NOT be used for submeters
  versions: {}, // stale/deprecated — must NOT be used for submeters
  created_at: '' as any,
  updated_at: '' as any,
  is_deleted: false,
  deleted_at: null as any,
};

function submeterProperty(currentVersion: number, versions: Record<string, { reset_at: any; last_reading: number }>): Property {
  return {
    id: 'prop-1',
    room_name: 'Room 1',
    tenant_amount: 1,
    meter_groups: {
      water: {
        meter_group_id: 'mg-1',
        is_main_meter: false,
        current_version: currentVersion,
        versions,
      },
    },
    created_at: '' as any,
    updated_at: '' as any,
    is_deleted: false,
    deleted_at: null as any,
  };
}

describe('true-reading (submeter, post-reset cumulative offset)', () => {
  it('sums prior version last_reading + current raw amount — reported QA scenario (634 + 5.5 = 639.5)', () => {
    const property = submeterProperty(2, {
      '1': { reset_at: '' as any, last_reading: 634 },
    });
    const reading: Reading = {
      id: 'r-1',
      meter_group_id: 'mg-1',
      property_id: 'prop-1',
      reading_amount: 5.5,
      reading_date: '' as any,
      meter_version: 2,
      image_url: null as any,
      created_at: '' as any,
      updated_at: '' as any,
      is_deleted: false,
      deleted_at: null as any,
    };

    expect(trueReading(reading, baseMeterGroup, property)).toBe(639.5);
  });

  it('ignores the deprecated MeterGroup-level versions/current_version for submeters', () => {
    const property = submeterProperty(1, {});
    const versionsSource = getVersionsSource(baseMeterGroup, property, 'mg-1');
    // Must resolve to the property entry's (empty) versions, not the meter group's.
    expect(versionsSource).toEqual({});
    expect(getCumulativeOffset(versionsSource, 1)).toBe(0);
  });

  it('resolves the version a NEW reading would get from the property entry for submeters', () => {
    const property = submeterProperty(3, {});
    expect(resolveCurrentVersion(baseMeterGroup, property, 'mg-1')).toBe(3);
  });

  it('falls back to the MeterGroup for a main-meter property', () => {
    const mainMeterProperty: Property = {
      id: 'prop-main',
      room_name: 'Main',
      tenant_amount: 1,
      meter_groups: {
        water: { meter_group_id: 'mg-1', is_main_meter: true },
      },
      created_at: '' as any,
      updated_at: '' as any,
      is_deleted: false,
      deleted_at: null as any,
    };
    expect(resolveCurrentVersion(baseMeterGroup, mainMeterProperty, 'mg-1')).toBe(5);
    expect(getVersionsSource(baseMeterGroup, mainMeterProperty, 'mg-1')).toBe(baseMeterGroup.versions);
  });
});
