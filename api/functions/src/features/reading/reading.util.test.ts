import { describe, it, expect } from '@jest/globals';
import { getCumulativeOffset, calculateTrueReading, validateMeterRollback } from './reading.util';
import { AppError } from '../../utils/error.util';
import type { Reading } from './reading.model';
import type { MeterGroupVersionEntry } from '../meter-group/meter-group.model';

const reading = (reading_amount: number, meter_version: number): Reading =>
  ({ reading_amount, meter_version } as Reading);

describe('getCumulativeOffset - across N meter resets', () => {
  it('returns 0 with no version history (0 resets)', () => {
    expect(getCumulativeOffset(undefined, 1)).toBe(0);
  });

  it('returns 0 for version 1 even with history present', () => {
    const versions: Record<string, MeterGroupVersionEntry> = {
      '1': { last_reading: 950 } as MeterGroupVersionEntry,
    };
    expect(getCumulativeOffset(versions, 1)).toBe(0);
  });

  it('sums one prior version (1 reset)', () => {
    const versions: Record<string, MeterGroupVersionEntry> = {
      '1': { last_reading: 950 } as MeterGroupVersionEntry,
    };
    expect(getCumulativeOffset(versions, 2)).toBe(950);
  });

  it('sums two prior versions (2 resets)', () => {
    const versions: Record<string, MeterGroupVersionEntry> = {
      '1': { last_reading: 950 } as MeterGroupVersionEntry,
      '2': { last_reading: 800 } as MeterGroupVersionEntry,
    };
    expect(getCumulativeOffset(versions, 3)).toBe(1750);
  });

  it('sums three prior versions (3 resets), skipping any missing entries', () => {
    const versions: Record<string, MeterGroupVersionEntry> = {
      '1': { last_reading: 950 } as MeterGroupVersionEntry,
      '2': { last_reading: 800 } as MeterGroupVersionEntry,
      '3': { last_reading: 500 } as MeterGroupVersionEntry,
    };
    expect(getCumulativeOffset(versions, 4)).toBe(2250);
  });
});

describe('calculateTrueReading - cumulative true value', () => {
  it('equals raw reading_amount with no version history', () => {
    expect(calculateTrueReading(reading(45, 1), undefined)).toBe(45);
  });

  it('adds cumulative offset for version 2 (1 reset)', () => {
    const versions: Record<string, MeterGroupVersionEntry> = {
      '1': { last_reading: 950 } as MeterGroupVersionEntry,
    };
    expect(calculateTrueReading(reading(45, 2), versions)).toBe(995);
  });

  it('adds cumulative offset for version 3 (2 resets)', () => {
    const versions: Record<string, MeterGroupVersionEntry> = {
      '1': { last_reading: 950 } as MeterGroupVersionEntry,
      '2': { last_reading: 800 } as MeterGroupVersionEntry,
    };
    expect(calculateTrueReading(reading(20, 3), versions)).toBe(1770);
  });

  it('produces a monotonically increasing true-reading sequence across resets (submeter scenario)', () => {
    const versions: Record<string, MeterGroupVersionEntry> = {
      '1': { last_reading: 1000 } as MeterGroupVersionEntry,
    };
    // Last reading before reset (v1) and first reading after reset (v2, near zero)
    const before = calculateTrueReading(reading(998, 1), versions);
    const after = calculateTrueReading(reading(5, 2), versions);
    expect(after).toBeGreaterThan(before);
    expect(after - before).toBe(7); // 1000 + 5 - 998
  });
});

describe('validateMeterRollback', () => {
  it('passes when current > previous at the same version', () => {
    expect(() => validateMeterRollback(100, 1, 105, 1)).not.toThrow();
  });

  it('throws when current <= previous at the same version', () => {
    expect(() => validateMeterRollback(100, 1, 100, 1)).toThrow(AppError);
    expect(() => validateMeterRollback(100, 1, 99, 1)).toThrow(AppError);
  });

  it('skips the rollback check across a reset boundary (version increases)', () => {
    // Meter reset to a low value after a version bump — must not throw even though
    // the raw reading_amount appears to "decrease".
    expect(() => validateMeterRollback(998, 1, 5, 2)).not.toThrow();
  });
});
