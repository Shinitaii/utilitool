import {Router} from "express";
import {
  createBillingCycle,
  getBillingCycleById,
  getBillingCycles,
  updateBillingCycle,
  deleteBillingCycle,
  softDeleteBillingCycle,
  createBatchBillingCycles,
  updateBatchBillingCycles,
} from "./billing-cycle.controller";
import {
  CreateBillingCycleBatchDTOSchema,
  CreateBillingCycleDTOSchema,
  BillingCycleByIdParamsDTOSchema,
  GetBillingCyclesQueryDTOSchema,
  UpdateBillingCycleBatchDTOSchema,
  UpdateBillingCycleDTOSchema,
} from "./billing-cycle.dto";
import {validateRequest} from "../../middlewares/validate-request.middleware";

const router = Router();

router.post(
  "/batch",
  validateRequest({body: CreateBillingCycleBatchDTOSchema}),
  createBatchBillingCycles
);

router.put(
  "/batch",
  validateRequest({body: UpdateBillingCycleBatchDTOSchema}),
  updateBatchBillingCycles
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

router.put(
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
  deleteBillingCycle
);

router.delete(
  "/soft/:id",
  validateRequest({params: BillingCycleByIdParamsDTOSchema}),
  softDeleteBillingCycle
);

export default router;
