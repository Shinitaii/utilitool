import {Request, Response} from "express";
import {tenantService} from "./tenant.service";
import {
  CreateTenantBatchDTO,
  CreateTenantDTO,
  GetTenantsQueryDTO,
  TenantByIdParamsDTO,
  UpdateTenantBatchDTO,
  UpdateTenantDTO,
} from "./tenant.dto";
import {AppError} from "../../utils/error.util";

export const createTenant = async (
  req: Request,
  res: Response
): Promise<void> => {
  const data = req.body as CreateTenantDTO;
  const result = await tenantService.create(data);
  res.status(201).json(result);
};

export const createBatchTenants = async (
  req: Request,
  res: Response
): Promise<void> => {
  const data = req.body as CreateTenantBatchDTO;
  const result = await tenantService.createBatch(data);
  res.status(201).json(result);
};

export const getTenantById = async (
  req: Request,
  res: Response
): Promise<void> => {
  const {id} = req.params as unknown as TenantByIdParamsDTO;
  const tenant = await tenantService.getById(id);

  if (!tenant) {
    throw new AppError(404, "Tenant not found");
  }

  res.status(200).json(tenant);
};

export const getTenants = async (
  req: Request,
  res: Response
): Promise<void> => {
  const query = req.query as unknown as GetTenantsQueryDTO;

  const result = await tenantService.search({
    tenantName: query.tenantName,
    propertyId: query.propertyId,
    limit: query.limit,
    cursor: query.cursor ?? null,
  });

  res.status(200).json(result);
};

export const updateTenant = async (
  req: Request,
  res: Response
): Promise<void> => {
  const {id} = req.params;
  const data = req.body as UpdateTenantDTO;
  const result = await tenantService.update(id, data);
  res.status(200).json(result);
};

export const updateBatchTenants = async (
  req: Request,
  res: Response
): Promise<void> => {
  const updates = req.body as UpdateTenantBatchDTO;
  const result = await tenantService.updateBatch(updates);
  res.status(200).json(result);
};

export const deleteTenant = async (
  req: Request,
  res: Response
): Promise<void> => {
  const {id} = req.params;
  await tenantService.delete(id);
  res.status(204).send();
};

export const softDeleteTenant = async (
  req: Request,
  res: Response
): Promise<void> => {
  const {id} = req.params;
  const result = await tenantService.softDelete(id);
  res.status(200).json(result);
};
