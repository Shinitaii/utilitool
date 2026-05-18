import {Request, Response} from "express";
import {billingService} from "./billing.service";
import {
  CreateBillingDTO,
  BillingByIdParamsDTO,
  GetBillingsQueryDTO,
  UpdateBillingDTO,
} from "./billing.dto";
import {AppError} from "../../utils/error.util";

export const createBilling = async (
  req: Request,
  res: Response
): Promise<void> => {
  const data = req.body as CreateBillingDTO;
  const result = await billingService.create(data);
  res.status(201).json(result);
};

export const createBatchBillings = async (
  req: Request,
  res: Response
): Promise<void> => {
  const data = req.body as CreateBillingDTO[];
  const result = await billingService.createBatch(data);
  res.status(201).json(result);
};

export const getBillingById = async (
  req: Request,
  res: Response
): Promise<void> => {
  const {id} = req.params as unknown as BillingByIdParamsDTO;
  const billing = await billingService.getById(id);

  if (!billing) {
    throw new AppError(404, "Billing not found");
  }

  res.status(200).json(billing);
};

export const getBillings = async (
  req: Request,
  res: Response
): Promise<void> => {
  const query = req.query as unknown as GetBillingsQueryDTO;

  const result = await billingService.search({
    propertyId: query.propertyId,
    limit: query.limit,
    cursor: query.cursor ?? null,
    archived: query.archived,
  });
  res.status(200).json(result);
};

export const updateBilling = async (
  req: Request,
  res: Response
): Promise<void> => {
  const {id} = req.params;
  const data = req.body as Partial<UpdateBillingDTO>;
  const result = await billingService.update(id, data);
  res.status(200).json(result);
};

export const updateBatchBillings = async (
  req: Request,
  res: Response
): Promise<void> => {
  const updates = req.body as { id: string; data: Partial<UpdateBillingDTO> }[];
  const result = await billingService.updateBatch(updates);
  res.status(200).json(result);
};

export const deleteBilling = async (
  req: Request,
  res: Response
): Promise<void> => {
  const {id} = req.params;
  await billingService.delete(id);
  res.status(204).send();
};

export const softDeleteBilling = async (
  req: Request,
  res: Response
): Promise<void> => {
  const {id} = req.params;
  const result = await billingService.softDelete(id);
  res.status(200).json(result);
};

export const restoreBilling = async (
  req: Request,
  res: Response
): Promise<void> => {
  const {id} = req.params;
  const result = await billingService.restore(id);
  res.status(200).json(result);
};
