import { Request, Response } from 'express';
import { geminiLib } from '../../lib/gemini.lib';
import { OcrBillDTO, OcrBillResponse } from './bills.dto';
import { AppError } from '../../utils/error.util';
import { logger } from '../../utils/logger.util';

export const ocrBill = async (req: Request, res: Response): Promise<void> => {
  const data = req.body as OcrBillDTO;

  if (!data.image_url) {
    throw new AppError(400, 'Image URL is required');
  }

  try {
    // Validate URL for security
    validateOcrUrl(data.image_url);

    logger.info({endpoint: '/bills/ocr', urlPrefix: data.image_url.substring(0, 20)}, 'Processing OCR request');

    const result = await geminiLib.extractBillData(data.image_url);

    if (!result) {
      throw new AppError(400, 'Failed to extract bill data from image');
    }

    res.status(200).json(result as OcrBillResponse);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    if (error instanceof Error && error.message.includes('Invalid image URL')) {
      throw new AppError(400, error.message);
    }
    logger.error({error, image_url: data.image_url.substring(0, 50)}, 'OCR processing failed');
    throw new AppError(400, 'Failed to process image. Please try a different image.');
  }
};

/**
 * Validates that a URL is safe for OCR processing.
 * Prevents SSRF attacks by blocking private/local addresses.
 */
function validateOcrUrl(url: string): void {
  // Block data: URLs (client should send actual URLs)
  if (url.startsWith('data:')) {
    throw new AppError(400, 'Data URLs are not supported for this endpoint');
  }

  try {
    const parsed = new URL(url);

    // Only allow HTTP(S)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new AppError(400, 'Invalid image URL: only http and https are allowed');
    }

    // Block RFC-1918 (private networks), loopback, link-local, and metadata services
    const blockedPattern =
      /^(10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+|127\.\d+\.\d+\.\d+|169\.254\.\d+\.\d+|::1|localhost|metadata\.google\.internal|169\.254\.169\.254)/i;

    if (blockedPattern.test(parsed.hostname)) {
      throw new AppError(400, 'Invalid image URL: private or reserved IP addresses are not allowed');
    }
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(400, 'Invalid image URL format');
  }
}
