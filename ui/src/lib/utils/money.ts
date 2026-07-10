/**
 * Mirrors api/functions/src/utils/money.util.ts: half-up rounding to 2dp.
 * Consumption (kWh/m³) stays float — only peso amounts go through this.
 */
export function roundHalfUp2dp(value: number): number {
	return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function billAmount(consumption: number, rate: number): number {
	return roundHalfUp2dp(consumption * rate);
}

export function sumMoney(values: number[]): number {
	return roundHalfUp2dp(values.reduce((sum, v) => sum + v, 0));
}
