import {Router} from "express";
import {
  createBatchTenants,
  createTenant,
  getTenantById,
  getTenants,
  softDeleteTenant,
  restoreTenant,
  purgeTenant,
  updateTenant,
  updateBatchTenants,
  clearCache,
} from "./tenant.controller";
import {
  CreateTenantBatchDTOSchema,
  CreateTenantDTOSchema,
  GetTenantsQueryDTOSchema,
  TenantByIdParamsDTOSchema,
  UpdateTenantBatchDTOSchema,
  UpdateTenantDTOSchema,
} from "./tenant.dto";
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
  validateRequest({body: CreateTenantBatchDTOSchema}),
  requireRole("admin", "landlord"),
  createBatchTenants
);

router.patch(
  "/batch",
  validateRequest({body: UpdateTenantBatchDTOSchema}),
  requireRole("admin", "landlord"),
  updateBatchTenants
);

router.post(
  "/",
  validateRequest({body: CreateTenantDTOSchema}),
  createTenant
);

router.get(
  "/",
  validateRequest({query: GetTenantsQueryDTOSchema}),
  getTenants
);

router.get(
  "/:id",
  validateRequest({params: TenantByIdParamsDTOSchema}),
  getTenantById
);

router.patch(
  "/:id",
  validateRequest({params: TenantByIdParamsDTOSchema, body: UpdateTenantDTOSchema}),
  updateTenant
);

router.delete(
  "/:id",
  validateRequest({params: TenantByIdParamsDTOSchema}),
  requireRole("admin", "landlord"),
  softDeleteTenant
);

router.patch(
  "/:id/restore",
  validateRequest({params: TenantByIdParamsDTOSchema}),
  requireRole("admin", "landlord"),
  restoreTenant
);

// Second step of the archive-then-purge lifecycle (right-to-erasure): only
// works on an already-archived (is_deleted=true) tenant, admin-only.
router.delete(
  "/:id/purge",
  validateRequest({params: TenantByIdParamsDTOSchema}),
  requireRole("admin"),
  purgeTenant
);

export const tenantRouter = router;
