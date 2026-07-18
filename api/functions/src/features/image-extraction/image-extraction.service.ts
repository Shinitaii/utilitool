import {AppError} from "../../utils/error.util";
import {visionOcrLib} from "../../lib/vision-ocr.lib";
import {llmConfigService} from "../llm-config/llm-config.service";
import type {ExtractedReadingData, ExtractedBillingData} from "./image-extraction.model";
import {Timestamp} from "firebase-admin/firestore";

/**
 * Service for extracting structured data from images using vision AI.
 * Handles both meter reading photos and utility bill photos.
 * Can be used by reading, billing, and billing-cycle features.
 */
export class ImageExtractionService {
  /**
   * Extract meter reading data from a photo via the user's configured vision model.
   * Returns the extracted meter amount and other metadata from the image.
   */
  static async extractReadingFromImage(imageUrl: string, userId: string): Promise<ExtractedReadingData> {
    if (!imageUrl) {
      throw new AppError(400, "Image URL is required");
    }

    try {
      // Validate URL format
      new URL(imageUrl);

      const visionConfig = await llmConfigService.getDecryptedVisionConfig(userId);
      const reading_amount = await visionOcrLib.extractReadingFromImage(imageUrl, visionConfig);

      if (reading_amount === null) {
        throw new AppError(422, "Could not extract reading from image");
      }

      return {
        id: "",
        created_at: Timestamp.now(),
        is_deleted: false,
        deleted_at: null,
        reading_amount,
        reading_date: new Date().toISOString(),
        image_url: imageUrl,
      } as any;
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      throw new AppError(400, `Failed to extract reading from image: ${err.message}`);
    }
  }

  /**
   * Extract billing cycle data from a utility bill photo via the user's configured vision model.
   * Returns dates, consumption, and rate extracted from the image.
   * This is the main integration point for the OCR endpoint.
   */
  static async extractBillingFromImage(imageUrl: string, userId: string): Promise<ExtractedBillingData> {
    if (!imageUrl) {
      throw new AppError(400, "Image URL is required");
    }

    try {
      // Validate URL format
      new URL(imageUrl);

      const visionConfig = await llmConfigService.getDecryptedVisionConfig(userId);
      const billData = await visionOcrLib.extractBillData(imageUrl, visionConfig);

      if (!billData) {
        throw new AppError(422, "Could not extract billing data from image");
      }

      return {
        id: "",
        created_at: Timestamp.now(),
        is_deleted: false,
        deleted_at: null,
        billing_start_date: billData.billing_start_date,
        billing_end_date: billData.billing_end_date,
        billing_consumption: billData.billing_consumption,
        billing_rate: billData.billing_rate,
        raw_amount: billData.raw_amount,
      } as any;
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      throw new AppError(400, `Failed to extract billing data from image: ${err.message}`);
    }
  }
}
