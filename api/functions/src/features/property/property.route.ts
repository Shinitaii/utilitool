import {Router} from "express";
import {
  createBatchProperties,
  createProperty,
  deleteProperty,
  getProperties,
  getPropertyById,
  softDeleteProperty,
  updateProperty,
  updateBatchProperties,
} from "./property.controller";
import {
  CreatePropertyBatchDTOSchema,
  CreatePropertyDTOSchema,
  GetPropertiesQueryDTOSchema,
  PropertyByIdParamsDTOSchema,
  UpdatePropertyBatchDTOSchema,
  UpdatePropertyDTOSchema,
} from "./property.dto";
import {validateRequest} from "../../middlewares/validate-request.middleware";

const router = Router();

router.post(
  "/batch",
  validateRequest({body: CreatePropertyBatchDTOSchema}),
  createBatchProperties
);

router.put(
  "/batch",
  validateRequest({body: UpdatePropertyBatchDTOSchema}),
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

router.put(
  "/:id",
  validateRequest({params: PropertyByIdParamsDTOSchema, body: UpdatePropertyDTOSchema}),
  updateProperty
);

router.delete(
  "/:id",
  validateRequest({params: PropertyByIdParamsDTOSchema}),
  deleteProperty
);

router.delete(
  "/soft/:id",
  validateRequest({params: PropertyByIdParamsDTOSchema}),
  softDeleteProperty
);

export default router;
