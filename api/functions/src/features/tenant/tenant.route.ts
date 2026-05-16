import { Router } from 'express';
import {
  createBatchTenants,
  createTenant,
  deleteTenant,
  getTenantById,
  getTenants,
  softDeleteTenant,
  updateTenant,
  updateBatchTenants,
} from './tenant.controller';
import {
  CreateTenantBatchDTOSchema,
  CreateTenantDTOSchema,
  GetTenantsQueryDTOSchema,
  TenantByIdParamsDTOSchema,
  UpdateTenantBatchDTOSchema,
  UpdateTenantDTOSchema,
} from './tenant.dto';
import { validateRequest } from '../../middlewares/validate-request.middleware';

const router = Router();

router.post(
  '/batch',
  validateRequest({ body: CreateTenantBatchDTOSchema }),
  createBatchTenants
);

router.put(
  '/batch',
  validateRequest({ body: UpdateTenantBatchDTOSchema }),
  updateBatchTenants
);

router.post(
  '/',
  validateRequest({ body: CreateTenantDTOSchema }),
  createTenant
);

router.get(
  '/',
  validateRequest({ query: GetTenantsQueryDTOSchema }),
  getTenants
);

router.get(
  '/:id',
  validateRequest({ params: TenantByIdParamsDTOSchema }),
  getTenantById
);

router.put(
  '/:id',
  validateRequest({ params: TenantByIdParamsDTOSchema, body: UpdateTenantDTOSchema }),
  updateTenant
);

router.delete(
  '/:id',
  validateRequest({ params: TenantByIdParamsDTOSchema }),
  deleteTenant
);

router.delete(
  '/soft/:id',
  validateRequest({ params: TenantByIdParamsDTOSchema }),
  softDeleteTenant
);

export default router;