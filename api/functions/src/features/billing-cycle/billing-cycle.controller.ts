import type {AuthenticatedRequest} from "../../utils/auth.util";
import {Response} from "express";
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
import {ImageExtractionService} from "../image-extraction/image-extraction.service";
import {cacheDelPattern} from "../../utils/cache.util";

export const createBillingCycle = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const data = req.body as CreateBillingCycleDTO;
  const userId = req.user?.userId;
  if (!userId) throw new AppError(401, "User not authenticated");
  const result = await billingCycleService.create(userId, data);
  res.status(201).json(result);
};

export const createBatchBillingCycles = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const data = req.body as CreateBillingCycleDTO[];
  const userId = req.user?.userId;
  if (!userId) throw new AppError(401, "User not authenticated");
  const result = await billingCycleService.createBatch(userId, data);
  res.status(201).json(result);
};

export const getBillingCycleById = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const {id} = req.params as unknown as BillingCycleByIdParamsDTO;
  const userId = req.user?.userId;
  if (!userId) throw new AppError(401, "User not authenticated");
  const billingCycle = await billingCycleService.getById(userId, id);

  if (!billingCycle) {
    throw new AppError(404, "Billing cycle not found");
  }

  res.status(200).json(billingCycle);
};

export const getBillingCycles = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const query = req.query as unknown as GetBillingCyclesQueryDTO;
  const userId = req.user?.userId;
  if (!userId) throw new AppError(401, "User not authenticated");

  const result = await billingCycleService.search(userId, {
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
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const {id} = req.params as unknown as BillingCycleByIdParamsDTO;
  const data = req.body as Partial<UpdateBillingCycleDTO>;
  const userId = req.user?.userId;
  if (!userId) throw new AppError(401, "User not authenticated");
  const result = await billingCycleService.update(userId, id, data);
  res.status(200).json(result);
};

export const updateBatchBillingCycles = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const updates = req.body as { id: string; data: Partial<UpdateBillingCycleDTO> }[];
  const userId = req.user?.userId;
  if (!userId) throw new AppError(401, "User not authenticated");
  const result = await billingCycleService.updateBatch(userId, updates);
  res.status(200).json(result);
};

export const deleteBillingCycle = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const {id} = req.params as unknown as BillingCycleByIdParamsDTO;
  const userId = req.user?.userId;
  if (!userId) throw new AppError(401, "User not authenticated");
  await billingCycleService.delete(userId, id);
  res.status(204).send();
};

export const softDeleteBillingCycle = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const {id} = req.params as unknown as BillingCycleByIdParamsDTO;
  const userId = req.user?.userId;
  if (!userId) throw new AppError(401, "User not authenticated");
  const result = await billingCycleService.softDelete(userId, id);
  res.status(200).json(result);
};

export const restoreBillingCycle = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const {id} = req.params as unknown as BillingCycleByIdParamsDTO;
  const userId = req.user?.userId;
  if (!userId) throw new AppError(401, "User not authenticated");
  const result = await billingCycleService.restore(userId, id);
  res.status(200).json(result);
};

export const purgeBillingCycle = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const {id} = req.params as unknown as BillingCycleByIdParamsDTO;
  const userId = req.user?.userId;
  if (!userId) throw new AppError(401, "User not authenticated");
  await billingCycleService.purge(userId, id);
  res.status(204).send();
};

export const ocrBillingCycle = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const {image_url} = req.body as OcrBillingCycleDTO;
  const userId = req.user?.userId;
  if (!userId) throw new AppError(401, "User not authenticated");
  const extracted = await ImageExtractionService.extractBillingFromImage(image_url, userId);
  const validated = OcrBillingCycleResponseSchema.parse({
    billing_start_date: extracted.billing_start_date,
    billing_end_date: extracted.billing_end_date,
    billing_consumption: extracted.billing_consumption,
    billing_rate: extracted.billing_rate,
    raw_amount: extracted.raw_amount,
  });
  res.status(200).json(validated);
};

export const clearCache = async (
  _req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const deletedCount = await cacheDelPattern("utilitool:billing-cycles:*");
  res.status(200).json({message: `Cleared ${deletedCount} cache entries for billing cycles`});
};
