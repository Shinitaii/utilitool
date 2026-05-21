import {Router} from "express";
import {
  createBilling,
  getBillingById,
  getBillings,
  updateBilling,
  deleteBilling,
  softDeleteBilling,
  restoreBilling,
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
import {requireRole} from "../../middlewares/require-role.middleware";

const router = Router();

router.post(
  "/batch",
  validateRequest({body: CreateBillingBatchDTOSchema}),
  requireRole('admin', 'landlord'),
  createBatchBillings
);

router.patch(
  "/batch",
  validateRequest({body: UpdateBillingBatchDTOSchema}),
  requireRole('admin', 'landlord'),
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

router.patch(
  "/:id",
  validateRequest({params: BillingByIdParamsDTOSchema, body: UpdateBillingDTOSchema}),
  updateBilling
);

router.delete(
  "/:id",
  validateRequest({params: BillingByIdParamsDTOSchema}),
  requireRole('admin', 'landlord'),
  softDeleteBilling
);

router.patch(
  "/:id/restore",
  validateRequest({params: BillingByIdParamsDTOSchema}),
  requireRole('admin', 'landlord'),
  restoreBilling
);

export default router;
