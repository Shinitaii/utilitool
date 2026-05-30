import {Router} from "express";
import {
  createBillingCycle,
  getBillingCycleById,
  getBillingCycles,
  updateBillingCycle,
  softDeleteBillingCycle,
  restoreBillingCycle,
  createBatchBillingCycles,
  updateBatchBillingCycles,
  ocrBillingCycle,
  clearCache,
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

const router = Router();

router.post(
  "/cache/clear",
  requireRole("admin"),
  clearCache
);

router.post(
  "/batch",
  validateRequest({body: CreateBillingCycleBatchDTOSchema}),
  requireRole("admin", "landlord"),
  createBatchBillingCycles
);

router.patch(
  "/batch",
  validateRequest({body: UpdateBillingCycleBatchDTOSchema}),
  requireRole("admin", "landlord"),
  updateBatchBillingCycles
);

router.post(
  "/ocr",
  validateRequest({body: OcrBillingCycleDTOSchema}),
  requireRole("admin", "landlord"),
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
  requireRole("admin", "landlord"),
  softDeleteBillingCycle
);

router.patch(
  "/:id/restore",
  validateRequest({params: BillingCycleByIdParamsDTOSchema}),
  requireRole("admin", "landlord"),
  restoreBillingCycle
);

export const billingCycleRouter = router;
