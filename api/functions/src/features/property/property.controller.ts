import {Request, Response} from "express";
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

export const createProperty = async (
  req: Request,
  res: Response
): Promise<void> => {
  const data = req.body as CreatePropertyDTO;
  const result = await propertyService.create(data);
  res.status(201).json(result);
};

export const createBatchProperties = async (
  req: Request,
  res: Response
): Promise<void> => {
  const data = req.body as CreatePropertyBatchDTO;
  const result = await propertyService.createBatch(data);
  res.status(201).json(result);
};

export const getPropertyById = async (
  req: Request,
  res: Response
): Promise<void> => {
  const {id} = req.params as unknown as PropertyByIdParamsDTO;
  const property = await propertyService.getById(id);

  if (!property) {
    throw new AppError(404, "Property not found");
  }

  res.status(200).json(property);
};

export const getProperties = async (
  req: Request,
  res: Response
): Promise<void> => {
  const query = req.query as unknown as GetPropertiesQueryDTO;

  const result = await propertyService.search({
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
  req: Request,
  res: Response
): Promise<void> => {
  const {id} = req.params;
  const data = req.body as UpdatePropertyDTO;
  const result = await propertyService.update(id, data);
  res.status(200).json(result);
};

export const updateBatchProperties = async (
  req: Request,
  res: Response
): Promise<void> => {
  const updates = req.body as UpdatePropertyBatchDTO;
  const result = await propertyService.updateBatch(updates);
  res.status(200).json(result);
};

export const deleteProperty = async (
  req: Request,
  res: Response
): Promise<void> => {
  const {id} = req.params;
  await propertyService.delete(id);
  res.status(204).send();
};

export const softDeleteProperty = async (
  req: Request,
  res: Response
): Promise<void> => {
  const {id} = req.params;
  const result = await propertyService.softDelete(id);
  res.status(200).json(result);
};

export const restoreProperty = async (
  req: Request,
  res: Response
): Promise<void> => {
  const {id} = req.params;
  const result = await propertyService.restore(id);
  res.status(200).json(result);
};
