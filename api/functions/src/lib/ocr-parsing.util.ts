export interface BillOcrResult {
  billing_start_date: string;
  billing_end_date: string;
  billing_consumption: number;
  billing_rate: number;
  raw_amount: number;
}

export const READING_PROMPT =
  "This is a utility meter display. Extract the numeric reading shown. Return only the integer value, nothing else.";

export const BILL_PROMPT =
  "This is a Philippine utility bill (Meralco or Manila Water). Extract as JSON: billing_start_date (YYYY-MM-DD), billing_end_date (YYYY-MM-DD), billing_consumption (number, kWh or cubic meters), billing_rate (number, cost per unit), raw_amount (total amount charged as number). Return only valid JSON, no other text.";

export function parseReadingResponse(text: string): number | null {
  const result = text.trim();
  const reading = parseInt(result, 10);
  return Number.isNaN(reading) ? null : reading;
}

export function parseBillDataResponse(text: string): BillOcrResult | null {
  const jsonMatch = text.trim().match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    return null;
  }

  const parsed = JSON.parse(jsonMatch[0]) as BillOcrResult;

  const result = {
    billing_start_date: parsed.billing_start_date,
    billing_end_date: parsed.billing_end_date,
    billing_consumption: Number(parsed.billing_consumption),
    billing_rate: Number(parsed.billing_rate),
    raw_amount: Number(parsed.raw_amount),
  };

  // Return null if any numeric field failed to parse
  if (
    Number.isNaN(result.billing_consumption) ||
    Number.isNaN(result.billing_rate) ||
    Number.isNaN(result.raw_amount)
  ) {
    return null;
  }

  return result;
}
