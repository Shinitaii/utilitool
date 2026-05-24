import {ExtractReadingFromImageSchema, ExtractBillingFromImageSchema} from "./image-extraction.dto";
import {AppError} from "../../utils/error.util";

export class ImageExtractionValidator {
  validateExtractReading(data: any): void {
    try {
      ExtractReadingFromImageSchema.parse(data);
    } catch (err: any) {
      throw new AppError(400, `Invalid reading extraction request: ${err.message}`);
    }
  }

  validateExtractBilling(data: any): void {
    try {
      ExtractBillingFromImageSchema.parse(data);
    } catch (err: any) {
      throw new AppError(400, `Invalid billing extraction request: ${err.message}`);
    }
  }
}
