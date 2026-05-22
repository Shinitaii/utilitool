import {Request, Response} from "express";
import {billingCycleService} from "./billing-cycle.service";
import {
  CreateBillingCycleDTO,
  BillingCycleByIdParamsDTO,
  GetBillingCyclesQueryDTO,
  UpdateBillingCycleDTO,
  OcrBillingCycleDTO,
  OcrBillingCycleResponseSchema,
} from "./billing-cycle.dto";
import {AppError} from "../../utils/error.util";
import {geminiLib} from "../../lib/gemini.lib";
import {logger} from "../../utils/logger.util";

export const createBillingCycle = async (
  req: Request,
  res: Response
): Promise<void> => {
  const data = req.body as CreateBillingCycleDTO;
  const result = await billingCycleService.create(data);
  res.status(201).json(result);
};

export const createBatchBillingCycles = async (
  req: Request,
  res: Response
): Promise<void> => {
  const data = req.body as CreateBillingCycleDTO[];
  const result = await billingCycleService.createBatch(data);
  res.status(201).json(result);
};

export const getBillingCycleById = async (
  req: Request,
  res: Response
): Promise<void> => {
  const {id} = req.params as unknown as BillingCycleByIdParamsDTO;
  const billingCycle = await billingCycleService.getById(id);

  if (!billingCycle) {
    throw new AppError(404, "Billing cycle not found");
  }

  res.status(200).json(billingCycle);
};

export const getBillingCycles = async (
  req: Request,
  res: Response
): Promise<void> => {
  const query = req.query as unknown as GetBillingCyclesQueryDTO;

  const result = await billingCycleService.search({
    billingStartDate: query.billingStartDate,
    billingEndDate: query.billingEndDate,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
    limit: query.limit,
    cursor: query.cursor ?? null,
    archived: query.archived,
  });
  res.status(200).json(result);
};

export const updateBillingCycle = async (
  req: Request,
  res: Response
): Promise<void> => {
  const {id} = req.params;
  const data = req.body as Partial<UpdateBillingCycleDTO>;
  const result = await billingCycleService.update(id, data);
  res.status(200).json(result);
};

export const updateBatchBillingCycles = async (
  req: Request,
  res: Response
): Promise<void> => {
  const updates = req.body as { id: string; data: Partial<UpdateBillingCycleDTO> }[];
  const result = await billingCycleService.updateBatch(updates);
  res.status(200).json(result);
};

export const deleteBillingCycle = async (
  req: Request,
  res: Response
): Promise<void> => {
  const {id} = req.params;
  await billingCycleService.delete(id);
  res.status(204).send();
};

export const softDeleteBillingCycle = async (
  req: Request,
  res: Response
): Promise<void> => {
  const {id} = req.params;
  const result = await billingCycleService.softDelete(id);
  res.status(200).json(result);
};

export const restoreBillingCycle = async (
  req: Request,
  res: Response
): Promise<void> => {
  const {id} = req.params;
  const result = await billingCycleService.restore(id);
  res.status(200).json(result);
};

export const ocrBillingCycle = async (
  req: Request,
  res: Response
): Promise<void> => {
  const {image_url} = req.body as OcrBillingCycleDTO;
  
  // Validate image_url format and security before processing
  if (!image_url) {
    throw new AppError(400, "Image URL is required");
  }

  try {
    // Validate URL (this will throw if it's invalid or private)
    validateOcrUrl(image_url);
    
    logger.info({endpoint: '/billing-cycles/ocr', urlPrefix: image_url.substring(0, 20)}, 'Processing OCR request');
    
    const result = await geminiLib.extractBillData(image_url);
    
    if (!result) {
      throw new AppError(422, "Could not extract billing data from the provided image. Please try a clearer photo of the utility bill.");
    }
    
    const validated = OcrBillingCycleResponseSchema.parse(result);
    res.status(200).json(validated);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    if (error instanceof Error && error.message.includes('Invalid image URL')) {
      throw new AppError(400, error.message);
    }
    logger.error({error, image_url: image_url.substring(0, 50)}, 'OCR processing failed');
    throw new AppError(400, 'Failed to process image. Please try a different image.');
  }
};

/**
 * Validates that a URL is safe for OCR processing.
 * Prevents SSRF attacks by blocking private/local addresses.
 */
function validateOcrUrl(url: string): void {
  // Block data: URLs (already handled by Gemini lib, but double-check)
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
