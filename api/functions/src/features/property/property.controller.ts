import type {AuthenticatedRequest} from "../../utils/auth.util";
import {Response} from "express";
import {propertyService} from "./property.service";
import {
  CreatePropertyBatchDTO,
  CreatePropertyDTO,
  GetPropertiesQueryDTO,
  PropertyByIdParamsDTO,
  UpdatePropertyBatchDTO,
  UpdatePropertyDTO,
} from "./property.dto";
import {AppError} from "../../utils/error.util";
import {cacheDelPattern} from "../../utils/cache.util";

export const createProperty = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const data = req.body as CreatePropertyDTO;
  const userId = req.user?.userId;
  if (!userId) throw new AppError(401, "User not authenticated");
  const result = await propertyService.create(userId, data);
  res.status(201).json(result);
};

export const createBatchProperties = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const data = req.body as CreatePropertyBatchDTO;
  const userId = req.user?.userId;
  if (!userId) throw new AppError(401, "User not authenticated");
  const result = await propertyService.createBatch(userId, data);
  res.status(201).json(result);
};

export const getPropertyById = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const {id} = req.params as unknown as PropertyByIdParamsDTO;
  const userId = req.user?.userId;
  if (!userId) throw new AppError(401, "User not authenticated");
  const property = await propertyService.getById(userId, id);

  if (!property) {
    throw new AppError(404, "Property not found");
  }

  res.status(200).json(property);
};

export const getProperties = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const query = req.query as unknown as GetPropertiesQueryDTO;
  const userId = req.user?.userId;
  if (!userId) throw new AppError(401, "User not authenticated");

  const result = await propertyService.search(userId, {
    roomName: query.roomName,
    meterGroupId: query.meterGroupId,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
    limit: query.limit,
    cursor: query.cursor ?? null,
    archived: query.archived,
  });

  res.status(200).json(result);
};

export const updateProperty = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const {id} = req.params as unknown as PropertyByIdParamsDTO;
  const data = req.body as UpdatePropertyDTO;
  const userId = req.user?.userId;
  if (!userId) throw new AppError(401, "User not authenticated");
  const result = await propertyService.update(userId, id, data);
  res.status(200).json(result);
};

export const updateBatchProperties = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const updates = req.body as UpdatePropertyBatchDTO;
  const userId = req.user?.userId;
  if (!userId) throw new AppError(401, "User not authenticated");
  const result = await propertyService.updateBatch(userId, updates);
  res.status(200).json(result);
};

export const deleteProperty = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const {id} = req.params as unknown as PropertyByIdParamsDTO;
  const userId = req.user?.userId;
  if (!userId) throw new AppError(401, "User not authenticated");
  await propertyService.delete(userId, id);
  res.status(204).send();
};

export const softDeleteProperty = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const {id} = req.params as unknown as PropertyByIdParamsDTO;
  const userId = req.user?.userId;
  if (!userId) throw new AppError(401, "User not authenticated");
  const result = await propertyService.softDelete(userId, id);
  res.status(200).json(result);
};

export const restoreProperty = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const {id} = req.params as unknown as PropertyByIdParamsDTO;
  const userId = req.user?.userId;
  if (!userId) throw new AppError(401, "User not authenticated");
  const result = await propertyService.restore(userId, id);
  res.status(200).json(result);
};

export const clearCache = async (
  _req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const deletedCount = await cacheDelPattern("utilitool:properties:*");
  res.status(200).json({message: `Cleared ${deletedCount} cache entries for properties`});
};
