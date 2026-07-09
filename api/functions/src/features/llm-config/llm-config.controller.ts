import type {AuthenticatedRequest} from "../../utils/auth.util";
import {Response} from "express";
import {llmConfigService} from "./llm-config.service";
import {UpsertLlmConfigDTO} from "./llm-config.dto";
import {AppError} from "../../utils/error.util";

export const getLlmConfig = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.userId;
  if (!userId) throw new AppError(401, "User not authenticated");
  const result = await llmConfigService.get(userId);
  if (!result) {
    res.status(200).json({provider: null, model: null, hasKey: false});
    return;
  }
  res.status(200).json(result);
};

export const upsertLlmConfig = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.userId;
  if (!userId) throw new AppError(401, "User not authenticated");
  const data = req.body as UpsertLlmConfigDTO;
  const result = await llmConfigService.upsert(userId, data);
  res.status(200).json(result);
};
