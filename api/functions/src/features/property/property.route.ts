import {Router} from "express";
import {
  createBatchProperties,
  createProperty,
  getProperties,
  getPropertyById,
  softDeleteProperty,
  restoreProperty,
  updateProperty,
  updateBatchProperties,
  recordPropertyMeterGroupReset,
  clearCache,
} from "./property.controller";
import {
  CreatePropertyBatchDTOSchema,
  CreatePropertyDTOSchema,
  GetPropertiesQueryDTOSchema,
  PropertyByIdParamsDTOSchema,
  PropertyMeterGroupResetParamsDTOSchema,
  UpdatePropertyBatchDTOSchema,
  UpdatePropertyDTOSchema,
} from "./property.dto";
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
  validateRequest({body: CreatePropertyBatchDTOSchema}),
  requireRole("admin", "landlord"),
  createBatchProperties
);

router.patch(
  "/batch",
  validateRequest({body: UpdatePropertyBatchDTOSchema}),
  requireRole("admin", "landlord"),
  updateBatchProperties
);

router.post(
  "/",
  validateRequest({body: CreatePropertyDTOSchema}),
  createProperty
);

router.get(
  "/",
  validateRequest({query: GetPropertiesQueryDTOSchema}),
  getProperties
);

router.get(
  "/:id",
  validateRequest({params: PropertyByIdParamsDTOSchema}),
  getPropertyById
);

router.post(
  "/:id/meter-groups/:meterGroupId/reset",
  validateRequest({params: PropertyMeterGroupResetParamsDTOSchema}),
  requireRole("admin", "landlord"),
  recordPropertyMeterGroupReset
);

router.patch(
  "/:id",
  validateRequest({params: PropertyByIdParamsDTOSchema, body: UpdatePropertyDTOSchema}),
  updateProperty
);

router.delete(
  "/:id",
  validateRequest({params: PropertyByIdParamsDTOSchema}),
  requireRole("admin", "landlord"),
  softDeleteProperty
);

router.patch(
  "/:id/restore",
  validateRequest({params: PropertyByIdParamsDTOSchema}),
  requireRole("admin", "landlord"),
  restoreProperty
);

export const propertyRouter = router;
