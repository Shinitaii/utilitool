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

const router = Router();

router.post(
  "/batch",
  validateRequest({body: CreateBillingCycleBatchDTOSchema}),
  createBatchBillingCycles
);

router.patch(
  "/batch",
  validateRequest({body: UpdateBillingCycleBatchDTOSchema}),
  updateBatchBillingCycles
);

router.post(
  "/ocr",
  validateRequest({body: OcrBillingCycleDTOSchema}),
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
  deleteBillingCycle
);

router.patch(
  "/:id/delete",
  validateRequest({params: BillingCycleByIdParamsDTOSchema}),
  softDeleteBillingCycle
);

router.patch(
  "/:id/restore",
  validateRequest({params: BillingCycleByIdParamsDTOSchema}),
  restoreBillingCycle
);

export default router;
