import {Router} from "express";
import {
  createMeterGroup,
  getMeterGroupById,
  getMeterGroups,
  updateMeterGroup,
  deleteMeterGroup,
  softDeleteMeterGroup,
  restoreMeterGroup,
  createBatchMeterGroups,
  updateBatchMeterGroups,
  recordMeterGroupReset,
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
  "/batch",
  validateRequest({body: CreateMeterGroupBatchDTOSchema}),
  createBatchMeterGroups
);

router.patch(
  "/batch",
  validateRequest({body: UpdateMeterGroupBatchDTOSchema}),
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
  requireRole('admin', 'landlord'),
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
  requireRole('admin', 'landlord'),
  deleteMeterGroup
);

router.patch(
  "/:id/delete",
  validateRequest({params: MeterGroupByIdParamsDTOSchema}),
  softDeleteMeterGroup
);

router.patch(
  "/:id/restore",
  validateRequest({params: MeterGroupByIdParamsDTOSchema}),
  restoreMeterGroup
);

export default router;
