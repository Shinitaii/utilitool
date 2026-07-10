import {Response} from "express";
import type {AuthenticatedRequest} from "../../utils/auth.util";
import {ImageExtractionService} from "./image-extraction.service";
import {ImageExtractionValidator} from "./image-extraction.validator";
import type {ExtractReadingRequest, ExtractBillingRequest} from "./image-extraction.dto";
import {AppError} from "../../utils/error.util";

const validator = new ImageExtractionValidator();

export async function extractReadingFromImage(
  req: AuthenticatedRequest,
  res: Response
) {
  const userId = req.user?.userId;
  if (!userId) throw new AppError(401, "User not authenticated");
  const body = req.body as ExtractReadingRequest;
  validator.validateExtractReading(body);
  const result = await ImageExtractionService.extractReadingFromImage(body.image_url, userId);
  res.json(result);
}

export async function extractBillingFromImage(
  req: AuthenticatedRequest,
  res: Response
) {
  const userId = req.user?.userId;
  if (!userId) throw new AppError(401, "User not authenticated");
  const body = req.body as ExtractBillingRequest;
  validator.validateExtractBilling(body);
  const result = await ImageExtractionService.extractBillingFromImage(body.image_url, userId);
  res.json(result);
}
