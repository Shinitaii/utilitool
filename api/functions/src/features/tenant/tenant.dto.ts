import {z} from "zod";
import {stripHtml} from "../../utils/sanitize.util";

export const CreateTenantDTOSchema = z.object({
  tenant_name: z.string().trim().min(1).max(255).transform(stripHtml),
  property_id: z.string().trim().min(1),
});
export type CreateTenantDTO = z.infer<typeof CreateTenantDTOSchema>;

export const CreateTenantBatchDTOSchema = z.array(CreateTenantDTOSchema).min(1).max(10);
export type CreateTenantBatchDTO = z.infer<typeof CreateTenantBatchDTOSchema>;

export const TenantByIdParamsDTOSchema = z.object({
  id: z.string().trim().min(1),
});
export type TenantByIdParamsDTO = z.infer<typeof TenantByIdParamsDTOSchema>;

export const UpdateTenantDTOSchema = CreateTenantDTOSchema.partial();
export type UpdateTenantDTO = z.infer<typeof UpdateTenantDTOSchema>;

export const UpdateTenantBatchItemSchema = z.object({
  id: z.string().min(1),
  data: UpdateTenantDTOSchema,
});

export const UpdateTenantBatchDTOSchema = z.array(UpdateTenantBatchItemSchema).min(1).max(10);
export type UpdateTenantBatchDTO = z.infer<typeof UpdateTenantBatchDTOSchema>;

export const GetTenantsQueryDTOSchema = z.object({
  tenantName: z.string().trim().min(1).max(255).optional(),
  propertyId: z.string().trim().min(1).optional(),
  sortBy: z.enum(["created_at", "tenant_name"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().trim().min(1).optional(),
  archived: z.enum(["true", "false"]).optional().transform(
    (val) => val === "true"
  ),
});
export type GetTenantsQueryDTO = z.infer<typeof GetTenantsQueryDTOSchema>;
