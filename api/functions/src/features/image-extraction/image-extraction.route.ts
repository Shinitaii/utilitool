import {Router} from "express";
import {validateRequest} from "../../middlewares/validate-request.middleware";
import {ExtractReadingFromImageSchema, ExtractBillingFromImageSchema} from "./image-extraction.dto";
import * as imageExtractionController from "./image-extraction.controller";
import {ocrRateLimiter} from "../../config/rate-limit.config";

export const imageExtractionRouter = Router();

imageExtractionRouter.post(
  "/readings",
  ocrRateLimiter,
  validateRequest({body: ExtractReadingFromImageSchema}),
  imageExtractionController.extractReadingFromImage
);

imageExtractionRouter.post(
  "/billings",
  ocrRateLimiter,
  validateRequest({body: ExtractBillingFromImageSchema}),
  imageExtractionController.extractBillingFromImage
);
