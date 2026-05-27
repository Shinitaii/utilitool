import {z} from "zod";

export const ExtractReadingFromImageSchema = z.object({
  image_url: z.string().url("Invalid image URL"),
});

export const ExtractBillingFromImageSchema = z.object({
  image_url: z.string().url("Invalid image URL"),
});

export type ExtractReadingRequest = z.infer<typeof ExtractReadingFromImageSchema>;
export type ExtractBillingRequest = z.infer<typeof ExtractBillingFromImageSchema>;

export const ExtractedReadingDataSchema = z.object({
  meter_group_id: z.string().optional(),
  property_id: z.string().optional(),
  reading_amount: z.number().nonnegative(),
  reading_date: z.string(),
  image_url: z.string().optional(),
});

export const ExtractedBillingDataSchema = z.object({
  billing_start_date: z.string(),
  billing_end_date: z.string(),
  billing_consumption: z.number().nonnegative(),
  billing_rate: z.number().nonnegative(),
  raw_amount: z.string().optional(),
});

export type ExtractedReadingResponse = z.infer<typeof ExtractedReadingDataSchema>;
export type ExtractedBillingResponse = z.infer<typeof ExtractedBillingDataSchema>;
