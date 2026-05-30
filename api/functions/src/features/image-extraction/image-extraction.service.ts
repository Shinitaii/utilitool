import {AppError} from "../../utils/error.util";
import {geminiLib} from "../../lib/gemini.lib";
import type {ExtractedReadingData, ExtractedBillingData} from "./image-extraction.model";
import {Timestamp} from "firebase-admin/firestore";

/**
 * Service for extracting structured data from images using vision AI.
 * Handles both meter reading photos and utility bill photos.
 * Can be used by reading, billing, and billing-cycle features.
 */
export class ImageExtractionService {
  /**
   * Extract meter reading data from a photo (via Gemini Vision).
   * Returns the extracted meter amount and other metadata from the image.
   */
  static async extractReadingFromImage(imageUrl: string): Promise<ExtractedReadingData> {
    if (!imageUrl) {
      throw new AppError(400, "Image URL is required");
    }

    try {
      // Validate URL format
      new URL(imageUrl);

      // Call Gemini to extract reading
      const reading_amount = await geminiLib.extractReadingFromImage(imageUrl);

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
   * Extract billing cycle data from a utility bill photo (via Gemini Vision).
   * Returns dates, consumption, and rate extracted from the image.
   * This is the main integration point for the OCR endpoint.
   */
  static async extractBillingFromImage(imageUrl: string): Promise<ExtractedBillingData> {
    if (!imageUrl) {
      throw new AppError(400, "Image URL is required");
    }

    try {
      // Validate URL format
      new URL(imageUrl);

      // Call Gemini to extract bill data
      const billData = await geminiLib.extractBillData(imageUrl);

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
      } as any;
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      throw new AppError(400, `Failed to extract billing data from image: ${err.message}`);
    }
  }
}
