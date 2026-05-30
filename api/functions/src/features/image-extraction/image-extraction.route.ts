import {Router} from "express";
import {validateRequest} from "../../middlewares/validate-request.middleware";
import {ExtractReadingFromImageSchema, ExtractBillingFromImageSchema} from "./image-extraction.dto";
import * as imageExtractionController from "./image-extraction.controller";

export const imageExtractionRouter = Router();

imageExtractionRouter.post(
  "/readings",
  validateRequest({body: ExtractReadingFromImageSchema}),
  imageExtractionController.extractReadingFromImage
);

imageExtractionRouter.post(
  "/billings",
  validateRequest({body: ExtractBillingFromImageSchema}),
  imageExtractionController.extractBillingFromImage
);
