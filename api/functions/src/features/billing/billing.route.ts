import {Router} from "express";
import {
  createBilling,
  getBillingById,
  getBillings,
  updateBilling,
  deleteBilling,
  softDeleteBilling,
  createBatchBillings,
  updateBatchBillings,
} from "./billing.controller";
import {
  CreateBillingBatchDTOSchema,
  CreateBillingDTOSchema,
  BillingByIdParamsDTOSchema,
  GetBillingsQueryDTOSchema,
  UpdateBillingBatchDTOSchema,
  UpdateBillingDTOSchema,
} from "./billing.dto";
import {validateRequest} from "../../middlewares/validate-request.middleware";

const router = Router();

router.post(
  "/batch",
  validateRequest({body: CreateBillingBatchDTOSchema}),
  createBatchBillings
);

router.put(
  "/batch",
  validateRequest({body: UpdateBillingBatchDTOSchema}),
  updateBatchBillings
);

router.post(
  "/",
  validateRequest({body: CreateBillingDTOSchema}),
  createBilling
);

router.get(
  "/",
  validateRequest({query: GetBillingsQueryDTOSchema}),
  getBillings
);

router.get(
  "/:id",
  validateRequest({params: BillingByIdParamsDTOSchema}),
  getBillingById
);

router.put(
  "/:id",
  validateRequest({params: BillingByIdParamsDTOSchema, body: UpdateBillingDTOSchema}),
  updateBilling
);

router.delete(
  "/:id",
  validateRequest({params: BillingByIdParamsDTOSchema}),
  deleteBilling
);

router.delete(
  "/soft/:id",
  validateRequest({params: BillingByIdParamsDTOSchema}),
  softDeleteBilling
);

export default router;
