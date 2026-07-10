import { describe, it, expect } from '@jest/globals';
import { roundHalfUp2dp, billAmount, sumMoney } from './money.util';

describe('roundHalfUp2dp', () => {
  it('rounds .005 up to 2dp (half-up, not banker\'s rounding)', () => {
    expect(roundHalfUp2dp(1.005)).toBe(1.01);
    expect(roundHalfUp2dp(2.675)).toBe(2.68);
  });

  it('handles the classic 0.1 + 0.2 float drift case', () => {
    expect(roundHalfUp2dp(0.1 + 0.2)).toBe(0.3);
  });

  it('rounds down when below the halfway point', () => {
    expect(roundHalfUp2dp(1.004)).toBe(1.0);
  });
});

describe('billAmount', () => {
  it('computes consumption × rate rounded half-up to 2dp', () => {
    expect(billAmount(10.555, 12)).toBe(126.66);
  });
});

describe('sumMoney', () => {
  it('sums values without float drift', () => {
    expect(sumMoney([0.1, 0.2, 0.3])).toBe(0.6);
  });

  it('rounds the final sum half-up to 2dp', () => {
    expect(sumMoney([1.005, 1.005])).toBe(2.01);
  });
});
