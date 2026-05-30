import {Router} from "express";
import {
  createMeterGroup,
  getMeterGroupById,
  getMeterGroups,
  updateMeterGroup,
  softDeleteMeterGroup,
  restoreMeterGroup,
  createBatchMeterGroups,
  updateBatchMeterGroups,
  recordMeterGroupReset,
  clearCache,
} from "./meter-group.controller";
import {
  CreateMeterGroupBatchDTOSchema,
  CreateMeterGroupDTOSchema,
  MeterGroupByIdParamsDTOSchema,
  GetMeterGroupsQueryDTOSchema,
  UpdateMeterGroupBatchDTOSchema,
  UpdateMeterGroupDTOSchema,
} from "./meter-group.dto";
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
  validateRequest({body: CreateMeterGroupBatchDTOSchema}),
  requireRole("admin", "landlord"),
  createBatchMeterGroups
);

router.patch(
  "/batch",
  validateRequest({body: UpdateMeterGroupBatchDTOSchema}),
  requireRole("admin", "landlord"),
  updateBatchMeterGroups
);

router.post(
  "/",
  validateRequest({body: CreateMeterGroupDTOSchema}),
  createMeterGroup
);

router.get(
  "/",
  validateRequest({query: GetMeterGroupsQueryDTOSchema}),
  getMeterGroups
);

router.get(
  "/:id",
  validateRequest({params: MeterGroupByIdParamsDTOSchema}),
  getMeterGroupById
);

router.post(
  "/:id/reset",
  validateRequest({params: MeterGroupByIdParamsDTOSchema}),
  requireRole("admin", "landlord"),
  recordMeterGroupReset
);

router.patch(
  "/:id",
  validateRequest({params: MeterGroupByIdParamsDTOSchema, body: UpdateMeterGroupDTOSchema}),
  updateMeterGroup
);

router.delete(
  "/:id",
  validateRequest({params: MeterGroupByIdParamsDTOSchema}),
  requireRole("admin", "landlord"),
  softDeleteMeterGroup
);

router.patch(
  "/:id/restore",
  validateRequest({params: MeterGroupByIdParamsDTOSchema}),
  requireRole("admin", "landlord"),
  restoreMeterGroup
);

export const meterGroupRouter = router;
