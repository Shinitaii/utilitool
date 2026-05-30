import {Router} from "express";
import {ocrBill} from "./bills.controller";
import {validateRequest} from "../../middlewares/validate-request.middleware";
import {requireRole} from "../../middlewares/require-role.middleware";
import {OcrBillDTOSchema} from "./bills.dto";

const router = Router();

router.post(
  "/ocr",
  validateRequest({body: OcrBillDTOSchema}),
  requireRole("admin", "landlord", "assistant"),
  ocrBill
);

export const billsRouter = router;
