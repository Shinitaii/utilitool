import type {AuthenticatedRequest} from "../../utils/auth.util";
import {Response} from "express";
import {meterGroupService} from "./meter-group.service";
import {
  CreateMeterGroupDTO,
  MeterGroupByIdParamsDTO,
  GetMeterGroupsQueryDTO,
  UpdateMeterGroupDTO,
} from "./meter-group.dto";
import {AppError} from "../../utils/error.util";
import {makeClearCacheHandler} from "../../utils/clear-cache-handler.util";

export const createMeterGroup = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const data = req.body as CreateMeterGroupDTO;
  const userId = req.user!.userId;
  const result = await meterGroupService.create(userId, data);
  res.status(201).json(result);
};

export const createBatchMeterGroups = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const data = req.body as CreateMeterGroupDTO[];
  const userId = req.user!.userId;
  const result = await meterGroupService.createBatch(userId, data);
  res.status(201).json(result);
};

export const getMeterGroupById = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const {id} = req.params as unknown as MeterGroupByIdParamsDTO;
  const userId = req.user!.userId;
  const meterGroup = await meterGroupService.getById(userId, id);

  if (!meterGroup) {
    throw new AppError(404, "Meter group not found");
  }

  res.status(200).json(meterGroup);
};

export const getMeterGroups = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const query = req.query as unknown as GetMeterGroupsQueryDTO;
  const userId = req.user!.userId;

  const result = await meterGroupService.search(userId, {
    meterName: query.meterName,
    utilityType: query.utilityType,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
    limit: query.limit,
    cursor: query.cursor ?? null,
    minimal: query.minimal,
    archived: query.archived,
  });
  res.status(200).json(result);
};

export const updateMeterGroup = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const {id} = req.params as unknown as MeterGroupByIdParamsDTO;
  const data = req.body as Partial<UpdateMeterGroupDTO>;
  const userId = req.user!.userId;
  const result = await meterGroupService.update(userId, id, data);
  res.status(200).json(result);
};

export const updateBatchMeterGroups = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const updates = req.body as { id: string; data: Partial<UpdateMeterGroupDTO> }[];
  const userId = req.user!.userId;
  const result = await meterGroupService.updateBatch(userId, updates);
  res.status(200).json(result);
};

export const deleteMeterGroup = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const {id} = req.params as unknown as MeterGroupByIdParamsDTO;
  const userId = req.user!.userId;
  await meterGroupService.delete(userId, id);
  res.status(204).send();
};

export const softDeleteMeterGroup = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const {id} = req.params as unknown as MeterGroupByIdParamsDTO;
  const userId = req.user!.userId;
  const result = await meterGroupService.softDelete(userId, id);
  res.status(200).json(result);
};

export const restoreMeterGroup = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const {id} = req.params as unknown as MeterGroupByIdParamsDTO;
  const userId = req.user!.userId;
  const result = await meterGroupService.restore(userId, id);
  res.status(200).json(result);
};

export const purgeMeterGroup = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const {id} = req.params as unknown as MeterGroupByIdParamsDTO;
  await meterGroupService.purge(id);
  res.status(204).send();
};

export const recordMeterGroupReset = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const {id} = req.params as unknown as MeterGroupByIdParamsDTO;
  const userId = req.user!.userId;
  const result = await meterGroupService.recordReset(userId, id);
  res.status(200).json(result);
};

export const clearCache = makeClearCacheHandler("meter-groups", "meter groups");
