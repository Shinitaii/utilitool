import {Request, Response} from "express";
import {ImageExtractionService} from "./image-extraction.service";
import {ImageExtractionValidator} from "./image-extraction.validator";
import type {ExtractReadingRequest, ExtractBillingRequest} from "./image-extraction.dto";

const validator = new ImageExtractionValidator();

export async function extractReadingFromImage(
  req: Request<{}, {}, ExtractReadingRequest>,
  res: Response
) {
  validator.validateExtractReading(req.body);
  const result = await ImageExtractionService.extractReadingFromImage(req.body.image_url);
  res.json(result);
}

export async function extractBillingFromImage(
  req: Request<{}, {}, ExtractBillingRequest>,
  res: Response
) {
  validator.validateExtractBilling(req.body);
  const result = await ImageExtractionService.extractBillingFromImage(req.body.image_url);
  res.json(result);
}
