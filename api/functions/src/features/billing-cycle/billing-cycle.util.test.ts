import {describe, it, expect} from '@jest/globals';
import {Timestamp} from 'firebase-admin/firestore';
import {computeRateEmaChain, RATE_EMA_GAMMA_BY_UTILITY_TYPE} from './billing-cycle.util';
import type {BillingCycle} from './billing-cycle.model';

type CycleInput = Pick<BillingCycle, 'id' | 'billing_rate' | 'billing_start_date'>;

const TEST_GAMMA = RATE_EMA_GAMMA_BY_UTILITY_TYPE.water;

const cycle = (id: string, billing_rate: number, monthOffset: number): CycleInput => ({
  id,
  billing_rate,
  billing_start_date: Timestamp.fromMillis(monthOffset * 30 * 24 * 60 * 60 * 1000),
});

describe('computeRateEmaChain', () => {
  it('seeds the first cycle with its own rate (no prior history)', () => {
    const result = computeRateEmaChain([cycle('a', 10, 0)], TEST_GAMMA);
    expect(result.get('a')).toBe(10);
  });

  it('applies the standard EMA update for a second cycle', () => {
    const alpha = 1 - TEST_GAMMA;
    const result = computeRateEmaChain([cycle('a', 10, 0), cycle('b', 20, 1)], TEST_GAMMA);
    expect(result.get('a')).toBe(10);
    expect(result.get('b')).toBeCloseTo(alpha * 20 + (1 - alpha) * 10);
  });

  it('is order-independent given unsorted input (sorts by billing_start_date internally)', () => {
    const sorted = computeRateEmaChain([cycle('a', 10, 0), cycle('b', 20, 1), cycle('c', 15, 2)], TEST_GAMMA);
    const shuffled = computeRateEmaChain([cycle('c', 15, 2), cycle('a', 10, 0), cycle('b', 20, 1)], TEST_GAMMA);
    expect(shuffled.get('a')).toBe(sorted.get('a'));
    expect(shuffled.get('b')).toBe(sorted.get('b'));
    expect(shuffled.get('c')).toBe(sorted.get('c'));
  });

  it('recomputes the full downstream chain when an out-of-order cycle is inserted', () => {
    // b (month 2) exists first; inserting a (month 0, before b) after the fact must shift
    // b's EMA, since it now has a predecessor it didn't have before.
    const beforeInsertion = computeRateEmaChain([cycle('b', 20, 2)], TEST_GAMMA);
    const afterInsertion = computeRateEmaChain([cycle('b', 20, 2), cycle('a', 10, 0)], TEST_GAMMA);
    expect(beforeInsertion.get('b')).toBe(20);
    expect(afterInsertion.get('b')).not.toBe(20);
    expect(afterInsertion.get('a')).toBe(10);
  });

  it('returns an empty map for no cycles', () => {
    expect(computeRateEmaChain([], TEST_GAMMA).size).toBe(0);
  });

  describe('seedEma', () => {
    it('resumes the chain from seedEma instead of the first cycle\'s own rate', () => {
      const alpha = 1 - TEST_GAMMA;
      const seeded = computeRateEmaChain([cycle('b', 20, 1)], TEST_GAMMA, 10);
      expect(seeded.get('b')).toBeCloseTo(alpha * 20 + (1 - alpha) * 10);
    });

    it('produces identical results to a full-history recompute (bounded-range fetch is a pure optimization)', () => {
      const full = computeRateEmaChain(
        [cycle('a', 10, 0), cycle('b', 20, 1), cycle('c', 15, 2), cycle('d', 18, 3)],
        TEST_GAMMA
      );
      // Simulate recomputeRateEmaForMeterGroup's bounded fetch: seed from 'b' (the cycle
      // immediately before the affected range) and only recompute 'c' and 'd'.
      const bounded = computeRateEmaChain(
        [cycle('c', 15, 2), cycle('d', 18, 3)],
        TEST_GAMMA,
        full.get('b')!
      );
      expect(bounded.get('c')).toBeCloseTo(full.get('c')!);
      expect(bounded.get('d')).toBeCloseTo(full.get('d')!);
    });

    it('defaults to null (seeds from the first cycle\'s own rate) when omitted', () => {
      const withDefault = computeRateEmaChain([cycle('a', 10, 0)], TEST_GAMMA);
      const withExplicitNull = computeRateEmaChain([cycle('a', 10, 0)], TEST_GAMMA, null);
      expect(withDefault.get('a')).toBe(withExplicitNull.get('a'));
      expect(withDefault.get('a')).toBe(10);
    });
  });
});
