import type {AuthenticatedRequest} from "../../utils/auth.util";
import {Response} from "express";
import {photoSettingsService} from "./photo-settings.service";
import {UpsertPhotoSettingsDTO} from "./photo-settings.dto";
import {AppError} from "../../utils/error.util";

export const getPhotoSettings = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.userId;
  if (!userId) throw new AppError(401, "User not authenticated");
  const result = await photoSettingsService.get(userId);
  res.status(200).json(result);
};

export const upsertPhotoSettings = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.userId;
  if (!userId) throw new AppError(401, "User not authenticated");
  const data = req.body as UpsertPhotoSettingsDTO;
  const result = await photoSettingsService.upsert(userId, data);
  res.status(200).json(result);
};
