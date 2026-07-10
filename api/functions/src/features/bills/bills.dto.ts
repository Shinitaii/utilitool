import {z} from "zod";
import {ImageUrlSchema} from "../../utils/image-url.util";

export const OcrBillDTOSchema = z.object({
  image_url: ImageUrlSchema,
});

export type OcrBillDTO = z.infer<typeof OcrBillDTOSchema>;

export interface OcrBillResponse {
  billing_start_date: string;
  billing_end_date: string;
  billing_consumption: number;
  billing_rate: number;
  raw_amount: number;
}
