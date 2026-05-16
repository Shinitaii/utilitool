import { Router } from 'express';
import { 
  createMeterGroup,
  getMeterGroupById,
  getMeterGroups,
  updateMeterGroup,
  deleteMeterGroup,
  softDeleteMeterGroup,
  createBatchMeterGroups,
  updateBatchMeterGroups,
} from "./meter-group.controller";
import {
  CreateMeterGroupBatchDTOSchema,
  CreateMeterGroupDTOSchema,
  MeterGroupByIdParamsDTOSchema,
  GetMeterGroupsQueryDTOSchema,
  UpdateMeterGroupBatchDTOSchema,
  UpdateMeterGroupDTOSchema,
} from "./meter-group.dto";
import { validateRequest } from '../../middlewares/validate-request.middleware';

const router = Router();

router.post(
  '/batch',
  validateRequest({ body: CreateMeterGroupBatchDTOSchema }),
  createBatchMeterGroups
);

router.put(
  '/batch',
  validateRequest({ body: UpdateMeterGroupBatchDTOSchema }),
  updateBatchMeterGroups
);

router.post(
  '/',
  validateRequest({ body: CreateMeterGroupDTOSchema }),
  createMeterGroup
);

router.get(
  '/',
  validateRequest({ query: GetMeterGroupsQueryDTOSchema }),
  getMeterGroups
);

router.get(
  '/:id',
  validateRequest({ params: MeterGroupByIdParamsDTOSchema }),
  getMeterGroupById
);

router.put(
  '/:id',
  validateRequest({ params: MeterGroupByIdParamsDTOSchema, body: UpdateMeterGroupDTOSchema }),
  updateMeterGroup
);

router.delete(
  '/:id',
  validateRequest({ params: MeterGroupByIdParamsDTOSchema }),
  deleteMeterGroup
);

router.delete(
	'/soft/:id',
  validateRequest({ params: MeterGroupByIdParamsDTOSchema }),
	softDeleteMeterGroup
);

export default router;