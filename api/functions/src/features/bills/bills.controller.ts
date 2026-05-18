import { Request, Response } from 'express';
import { geminiLib } from '../../lib/gemini.lib';
import { OcrBillDTO, OcrBillResponse } from './bills.dto';
import { AppError } from '../../utils/error.util';

export const ocrBill = async (req: Request, res: Response): Promise<void> => {
  const data = req.body as OcrBillDTO;

  if (!data.image_url) {
    throw new AppError(400, 'Image URL is required');
  }

  const result = await geminiLib.extractBillData(data.image_url);

  if (!result) {
    throw new AppError(400, 'Failed to extract bill data from image');
  }

  res.status(200).json(result as OcrBillResponse);
};
