import Decimal from "decimal.js";

/**
 * Single source of truth for monetary rounding: half-up to 2 decimal places.
 * Call sites should never touch raw Decimal/number money math directly.
 */
export function roundHalfUp2dp(value: number | Decimal): number {
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}

export function money(value: number | string): Decimal {
  return new Decimal(value);
}

/** Computes consumption × rate, rounded half-up to 2dp at the bill total boundary. */
export function billAmount(consumption: number, rate: number): number {
  return roundHalfUp2dp(money(consumption).times(rate));
}

/** Sums an array of money values, rounding the result half-up to 2dp. */
export function sumMoney(values: number[]): number {
  return roundHalfUp2dp(values.reduce((sum, v) => sum.plus(v), new Decimal(0)));
}
