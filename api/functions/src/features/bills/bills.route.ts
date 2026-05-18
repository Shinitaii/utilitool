import { Router } from 'express';
import { ocrBill } from './bills.controller';
import { validateRequest } from '../../middlewares/validate-request.middleware';
import { OcrBillDTOSchema } from './bills.dto';

const router = Router();

router.post('/ocr', validateRequest({ body: OcrBillDTOSchema }), ocrBill);

export default router;
