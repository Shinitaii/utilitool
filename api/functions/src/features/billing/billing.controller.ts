import type {AuthenticatedRequest} from "../../utils/auth.util";
import {Response} from "express";
import {billingService} from "./billing.service";
import {
  CreateBillingDTO,
  BillingByIdParamsDTO,
  GetBillingsQueryDTO,
  UpdateBillingDTO,
} from "./billing.dto";
import {AppError} from "../../utils/error.util";

export const createBilling = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const data = req.body as CreateBillingDTO;
  const userId = req.user?.userId;
  if (!userId) throw new AppError(401, "User not authenticated");
  const result = await billingService.create(userId, data);
  res.status(201).json(result);
};

export const createBatchBillings = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const data = req.body as CreateBillingDTO[];
  const userId = req.user?.userId;
  if (!userId) throw new AppError(401, "User not authenticated");
  const result = await billingService.createBatch(userId, data);
  res.status(201).json(result);
};

export const getBillingById = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const {id} = req.params as unknown as BillingByIdParamsDTO;
  const userId = req.user?.userId;
  if (!userId) throw new AppError(401, "User not authenticated");
  const billing = await billingService.getById(userId, id);

  if (!billing) {
    throw new AppError(404, "Billing not found");
  }

  res.status(200).json(billing);
};

export const getBillings = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const query = req.query as unknown as GetBillingsQueryDTO;
  const userId = req.user?.userId;
  if (!userId) throw new AppError(401, "User not authenticated");

  const result = await billingService.search(userId, {
    propertyId: query.propertyId,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
    limit: query.limit,
    cursor: query.cursor ?? null,
    archived: query.archived,
  });
  res.status(200).json(result);
};

export const updateBilling = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const {id} = req.params;
  const data = req.body as Partial<UpdateBillingDTO>;
  const userId = req.user?.userId;
  if (!userId) throw new AppError(401, "User not authenticated");
  const result = await billingService.update(userId, id, data);
  res.status(200).json(result);
};

export const updateBatchBillings = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const updates = req.body as { id: string; data: Partial<UpdateBillingDTO> }[];
  const userId = req.user?.userId;
  if (!userId) throw new AppError(401, "User not authenticated");
  const result = await billingService.updateBatch(userId, updates);
  res.status(200).json(result);
};

export const deleteBilling = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const {id} = req.params;
  const userId = req.user?.userId;
  if (!userId) throw new AppError(401, "User not authenticated");
  await billingService.delete(userId, id);
  res.status(204).send();
};

export const softDeleteBilling = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const {id} = req.params;
  const userId = req.user?.userId;
  if (!userId) throw new AppError(401, "User not authenticated");
  const result = await billingService.softDelete(userId, id);
  res.status(200).json(result);
};

export const restoreBilling = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const {id} = req.params;
  const userId = req.user?.userId;
  if (!userId) throw new AppError(401, "User not authenticated");
  const result = await billingService.restore(userId, id);
  res.status(200).json(result);
};
