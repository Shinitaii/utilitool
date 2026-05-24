import type {AuthenticatedRequest} from "../../utils/auth.util";
import {Response} from "express";
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
import {ImageExtractionService} from "../image-extraction/image-extraction.service";

export const createReading = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const data = req.body as CreateReadingDTO;
  const userId = req.user?.userId;
  if (!userId) throw new AppError(401, "User not authenticated");
  const result = await readingService.create(userId, data);
  res.status(201).json(result);
};

export const createSeedReading = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const data = req.body as CreateSeedReadingDTO;
  const userId = req.user?.userId;
  if (!userId) throw new AppError(401, "User not authenticated");
  const result = await readingService.createSeed(userId, data);
  res.status(201).json(result);
};

export const createBatchReadings = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const data = req.body as CreateReadingDTO[];
  const userId = req.user?.userId;
  if (!userId) throw new AppError(401, "User not authenticated");
  const result = await readingService.createBatch(userId, data);
  res.status(201).json(result);
};

export const getReadingById = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const {id} = req.params as unknown as ReadingByIdParamsDTO;
  const userId = req.user?.userId;
  if (!userId) throw new AppError(401, "User not authenticated");
  const reading = await readingService.getById(userId, id);

  if (!reading) {
    throw new AppError(404, "Reading not found");
  }

  res.status(200).json(reading);
};

export const getReadings = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const query = req.query as unknown as GetReadingsQueryDTO;
  const userId = req.user?.userId;
  if (!userId) throw new AppError(401, "User not authenticated");

  const result = await readingService.search(userId, {
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
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const {id} = req.params;
  const data = req.body as Partial<UpdateReadingDTO>;
  const userId = req.user?.userId;
  if (!userId) throw new AppError(401, "User not authenticated");
  const result = await readingService.update(userId, id, data);
  res.status(200).json(result);
};

export const updateBatchReadings = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const updates = req.body as { id: string; data: Partial<UpdateReadingDTO> }[];
  const userId = req.user?.userId;
  if (!userId) throw new AppError(401, "User not authenticated");
  const result = await readingService.updateBatch(userId, updates);
  res.status(200).json(result);
};

export const deleteReading = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const {id} = req.params;
  const userId = req.user?.userId;
  if (!userId) throw new AppError(401, "User not authenticated");
  await readingService.delete(userId, id);
  res.status(204).send();
};

export const softDeleteReading = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const {id} = req.params;
  const userId = req.user?.userId;
  if (!userId) throw new AppError(401, "User not authenticated");
  const result = await readingService.softDelete(userId, id);
  res.status(200).json(result);
};

export const restoreReading = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const {id} = req.params;
  const userId = req.user?.userId;
  if (!userId) throw new AppError(401, "User not authenticated");
  const result = await readingService.restore(userId, id);
  res.status(200).json(result);
};

export const ocrReading = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const data = req.body as OcrReadingDTO;
  const extracted = await ImageExtractionService.extractReadingFromImage(data.image_url);
  res.status(200).json({ suggested_reading_amount: extracted.reading_amount });
};
