import { Router } from 'express';
import { ocrBill } from './bills.controller';
import { validateRequest } from '../../middlewares/validate-request.middleware';
import { OcrBillDTOSchema } from './bills.dto';
import { ocrRateLimiter } from '../../config/rate-limit.config';

const router = Router();

router.post('/ocr', ocrRateLimiter, validateRequest({ body: OcrBillDTOSchema }), ocrBill);

export default router;
