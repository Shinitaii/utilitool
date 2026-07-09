import {Request, Response} from "express";
import {ImageExtractionService} from "../image-extraction/image-extraction.service";
import {OcrBillDTO, OcrBillResponse} from "./bills.dto";

/**
 * Thin wrapper around the shared image-extraction service — this endpoint and
 * `POST /image-extraction/billings` extract the same data from the same kind
 * of photo. Delegating here (rather than calling geminiLib directly, as this
 * controller used to) keeps a single source of truth for the extraction call,
 * its URL validation, and its 422-on-extraction-failure semantics.
 */
export const ocrBill = async (req: Request, res: Response): Promise<void> => {
  const data = req.body as OcrBillDTO;

  const extracted = await ImageExtractionService.extractBillingFromImage(data.image_url);

  const result: OcrBillResponse = {
    billing_start_date: extracted.billing_start_date,
    billing_end_date: extracted.billing_end_date,
    billing_consumption: extracted.billing_consumption,
    billing_rate: extracted.billing_rate,
    raw_amount: extracted.billing_rate * extracted.billing_consumption,
  };

  res.status(200).json(result);
};
