import {Request, Response} from "express";
import {meterGroupService} from "./meter-group.service";
import {
  CreateMeterGroupDTO,
  MeterGroupByIdParamsDTO,
  GetMeterGroupsQueryDTO,
  UpdateMeterGroupDTO,
} from "./meter-group.dto";
import {AppError} from "../../utils/error.util";

export const createMeterGroup = async (
  req: Request,
  res: Response
): Promise<void> => {
  const data = req.body as CreateMeterGroupDTO;
  const result = await meterGroupService.create(data);
  res.status(201).json(result);
};

export const createBatchMeterGroups = async (
  req: Request,
  res: Response
): Promise<void> => {
  const data = req.body as CreateMeterGroupDTO[];
  const result = await meterGroupService.createBatch(data);
  res.status(201).json(result);
};

export const getMeterGroupById = async (
  req: Request,
  res: Response
): Promise<void> => {
  const {id} = req.params as unknown as MeterGroupByIdParamsDTO;
  const meterGroup = await meterGroupService.getById(id);

  if (!meterGroup) {
    throw new AppError(404, "Meter group not found");
  }

  res.status(200).json(meterGroup);
};

export const getMeterGroups = async (
  req: Request,
  res: Response
): Promise<void> => {
  const query = req.query as unknown as GetMeterGroupsQueryDTO;

  const result = await meterGroupService.search({
    meterName: query.meterName,
    utilityType: query.utilityType,
    limit: query.limit,
    cursor: query.cursor ?? null,
    minimal: query.minimal,
    archived: query.archived,
  });
  res.status(200).json(result);
};

export const updateMeterGroup = async (
  req: Request,
  res: Response
): Promise<void> => {
  const {id} = req.params;
  const data = req.body as Partial<UpdateMeterGroupDTO>;
  const result = await meterGroupService.update(id, data);
  res.status(200).json(result);
};

export const updateBatchMeterGroups = async (
  req: Request,
  res: Response
): Promise<void> => {
  const updates = req.body as { id: string; data: Partial<UpdateMeterGroupDTO> }[];
  const result = await meterGroupService.updateBatch(updates);
  res.status(200).json(result);
};

export const deleteMeterGroup = async (
  req: Request,
  res: Response
): Promise<void> => {
  const {id} = req.params;
  await meterGroupService.delete(id);
  res.status(204).send();
};

export const softDeleteMeterGroup = async (
  req: Request,
  res: Response
): Promise<void> => {
  const {id} = req.params;
  const result = await meterGroupService.softDelete(id);
  res.status(200).json(result);
};

export const restoreMeterGroup = async (
  req: Request,
  res: Response
): Promise<void> => {
  const {id} = req.params;
  const result = await meterGroupService.restore(id);
  res.status(200).json(result);
};

export const recordMeterGroupReset = async (
  req: Request,
  res: Response
): Promise<void> => {
  const {id} = req.params as unknown as MeterGroupByIdParamsDTO;
  const result = await meterGroupService.recordReset(id);
  res.status(200).json(result);
};
