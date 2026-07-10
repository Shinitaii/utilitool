import { describe, it, expect } from 'vitest';
import { roundHalfUp2dp, billAmount, sumMoney } from './money';

describe('roundHalfUp2dp', () => {
	it('rounds .005 up to 2dp (half-up)', () => {
		expect(roundHalfUp2dp(1.005)).toBe(1.01);
	});

	it('handles 0.1 + 0.2 float drift', () => {
		expect(roundHalfUp2dp(0.1 + 0.2)).toBe(0.3);
	});
});

describe('billAmount', () => {
	it('matches the API rounding for the same cycle (10.125 rate)', () => {
		expect(billAmount(3, 10.125)).toBe(30.38);
		expect(billAmount(7, 10.125)).toBe(70.88);
	});
});

describe('sumMoney', () => {
	it('sums already-rounded amounts to the exact centavo', () => {
		expect(sumMoney([30.38, 70.88])).toBe(101.26);
	});
});
