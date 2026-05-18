import {Request, Response} from "express";
import {billingCycleService} from "./billing-cycle.service";
import {
  CreateBillingCycleDTO,
  BillingCycleByIdParamsDTO,
  GetBillingCyclesQueryDTO,
  UpdateBillingCycleDTO,
} from "./billing-cycle.dto";
import {AppError} from "../../utils/error.util";

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
