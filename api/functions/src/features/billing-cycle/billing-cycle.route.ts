import {Router} from "express";
import {
  createBillingCycle,
  getBillingCycleById,
  getBillingCycles,
  updateBillingCycle,
  deleteBillingCycle,
  softDeleteBillingCycle,
  restoreBillingCycle,
  createBatchBillingCycles,
  updateBatchBillingCycles,
  ocrBillingCycle,
} from "./billing-cycle.controller";
import {
  CreateBillingCycleBatchDTOSchema,
  CreateBillingCycleDTOSchema,
  BillingCycleByIdParamsDTOSchema,
  GetBillingCyclesQueryDTOSchema,
  UpdateBillingCycleBatchDTOSchema,
  UpdateBillingCycleDTOSchema,
  OcrBillingCycleDTOSchema,
} from "./billing-cycle.dto";
import {validateRequest} from "../../middlewares/validate-request.middleware";
import {requireRole} from "../../middlewares/require-role.middleware";
import {ocrRateLimiter} from "../../config/rate-limit.config";

const router = Router();

router.post(
  "/batch",
  validateRequest({body: CreateBillingCycleBatchDTOSchema}),
  requireRole('admin', 'landlord'),
  createBatchBillingCycles
);

router.patch(
  "/batch",
  validateRequest({body: UpdateBillingCycleBatchDTOSchema}),
  requireRole('admin', 'landlord'),
  updateBatchBillingCycles
);

router.post(
  "/ocr",
  ocrRateLimiter,
  validateRequest({body: OcrBillingCycleDTOSchema}),
  requireRole('admin', 'landlord'),
  ocrBillingCycle
);

router.post(
  "/",
  validateRequest({body: CreateBillingCycleDTOSchema}),
  createBillingCycle
);

router.get(
  "/",
  validateRequest({query: GetBillingCyclesQueryDTOSchema}),
  getBillingCycles
);

router.get(
  "/:id",
  validateRequest({params: BillingCycleByIdParamsDTOSchema}),
  getBillingCycleById
);

router.patch(
  "/:id",
  validateRequest({
    params: BillingCycleByIdParamsDTOSchema,
    body: UpdateBillingCycleDTOSchema,
  }),
  updateBillingCycle
);

router.delete(
  "/:id",
  validateRequest({params: BillingCycleByIdParamsDTOSchema}),
  requireRole('admin', 'landlord'),
  softDeleteBillingCycle
);

router.patch(
  "/:id/restore",
  validateRequest({params: BillingCycleByIdParamsDTOSchema}),
  requireRole('admin', 'landlord'),
  restoreBillingCycle
);

export default router;
