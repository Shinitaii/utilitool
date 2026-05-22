import {Request, Response} from "express";
import {readingService} from "./reading.service";
import {
  CreateReadingDTO,
  CreateSeedReadingDTO,
  ReadingByIdParamsDTO,
  GetReadingsQueryDTO,
  UpdateReadingDTO,
  OcrReadingDTO,
} from "./reading.dto";
import {AppError} from "../../utils/error.util";

export const createReading = async (
  req: Request,
  res: Response
): Promise<void> => {
  const data = req.body as CreateReadingDTO;
  const result = await readingService.create(data);
  res.status(201).json(result);
};

export const createSeedReading = async (
  req: Request,
  res: Response
): Promise<void> => {
  const data = req.body as CreateSeedReadingDTO;
  const result = await readingService.createSeed(data);
  res.status(201).json(result);
};

export const createBatchReadings = async (
  req: Request,
  res: Response
): Promise<void> => {
  const data = req.body as CreateReadingDTO[];
  const result = await readingService.createBatch(data);
  res.status(201).json(result);
};

export const getReadingById = async (
  req: Request,
  res: Response
): Promise<void> => {
  const {id} = req.params as unknown as ReadingByIdParamsDTO;
  const reading = await readingService.getById(id);

  if (!reading) {
    throw new AppError(404, "Reading not found");
  }

  res.status(200).json(reading);
};

export const getReadings = async (
  req: Request,
  res: Response
): Promise<void> => {
  const query = req.query as unknown as GetReadingsQueryDTO;

  const result = await readingService.search({
    meterGroupId: query.meterGroupId,
    propertyId: query.propertyId,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
    limit: query.limit,
    cursor: query.cursor ?? null,
    archived: query.archived,
  });
  res.status(200).json(result);
};

export const updateReading = async (
  req: Request,
  res: Response
): Promise<void> => {
  const {id} = req.params;
  const data = req.body as Partial<UpdateReadingDTO>;
  const result = await readingService.update(id, data);
  res.status(200).json(result);
};

export const updateBatchReadings = async (
  req: Request,
  res: Response
): Promise<void> => {
  const updates = req.body as { id: string; data: Partial<UpdateReadingDTO> }[];
  const result = await readingService.updateBatch(updates);
  res.status(200).json(result);
};

export const deleteReading = async (
  req: Request,
  res: Response
): Promise<void> => {
  const {id} = req.params;
  await readingService.delete(id);
  res.status(204).send();
};

export const softDeleteReading = async (
  req: Request,
  res: Response
): Promise<void> => {
  const {id} = req.params;
  const result = await readingService.softDelete(id);
  res.status(200).json(result);
};

export const restoreReading = async (
  req: Request,
  res: Response
): Promise<void> => {
  const {id} = req.params;
  const result = await readingService.restore(id);
  res.status(200).json(result);
};

export const ocrReading = async (
  req: Request,
  res: Response
): Promise<void> => {
  const data = req.body as OcrReadingDTO;
  const result = await readingService.extractReadingFromImage(data.image_url);
  res.status(200).json({ suggested_reading_amount: result });
};
