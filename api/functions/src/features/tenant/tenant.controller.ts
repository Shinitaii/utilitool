import type {AuthenticatedRequest} from "../../utils/auth.util";
import {Response} from "express";
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
import {cacheDelPattern} from "../../utils/cache.util";

export const createTenant = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const data = req.body as CreateTenantDTO;
  const userId = req.user?.userId;
  if (!userId) throw new AppError(401, "User not authenticated");
  const result = await tenantService.create(userId, data);
  res.status(201).json(result);
};

export const createBatchTenants = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const data = req.body as CreateTenantBatchDTO;
  const userId = req.user?.userId;
  if (!userId) throw new AppError(401, "User not authenticated");
  const result = await tenantService.createBatch(userId, data);
  res.status(201).json(result);
};

export const getTenantById = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const {id} = req.params as unknown as TenantByIdParamsDTO;
  const userId = req.user?.userId;
  if (!userId) throw new AppError(401, "User not authenticated");
  const tenant = await tenantService.getById(userId, id);

  if (!tenant) {
    throw new AppError(404, "Tenant not found");
  }

  res.status(200).json(tenant);
};

export const getTenants = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const query = req.query as unknown as GetTenantsQueryDTO;
  const userId = req.user?.userId;
  if (!userId) throw new AppError(401, "User not authenticated");

  const result = await tenantService.search(userId, {
    tenantName: query.tenantName,
    propertyId: query.propertyId,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
    limit: query.limit,
    cursor: query.cursor ?? null,
    archived: query.archived,
  });

  res.status(200).json(result);
};

export const updateTenant = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const {id} = req.params;
  const data = req.body as UpdateTenantDTO;
  const userId = req.user?.userId;
  if (!userId) throw new AppError(401, "User not authenticated");
  const result = await tenantService.update(userId, id, data);
  res.status(200).json(result);
};

export const updateBatchTenants = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const updates = req.body as UpdateTenantBatchDTO;
  const userId = req.user?.userId;
  if (!userId) throw new AppError(401, "User not authenticated");
  const result = await tenantService.updateBatch(userId, updates);
  res.status(200).json(result);
};

export const deleteTenant = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const {id} = req.params;
  const userId = req.user?.userId;
  if (!userId) throw new AppError(401, "User not authenticated");
  await tenantService.delete(userId, id);
  res.status(204).send();
};

export const softDeleteTenant = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const {id} = req.params;
  const userId = req.user?.userId;
  if (!userId) throw new AppError(401, "User not authenticated");
  const result = await tenantService.softDelete(userId, id);
  res.status(200).json(result);
};

export const restoreTenant = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const {id} = req.params;
  const userId = req.user?.userId;
  if (!userId) throw new AppError(401, "User not authenticated");
  const result = await tenantService.restore(userId, id);
  res.status(200).json(result);
};

export const clearCache = async (
  _req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const deletedCount = await cacheDelPattern('utilitool:tenants:*');
  res.status(200).json({ message: `Cleared ${deletedCount} cache entries for tenants` });
};
