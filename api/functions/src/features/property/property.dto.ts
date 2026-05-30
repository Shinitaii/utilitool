import {z} from "zod";
import {stripHtml} from "../../utils/sanitize.util";
import {UTILITY_TYPES} from "../../constants/utility.constants";

const MeterGroupEntrySchema = z.object({
  meter_group_id: z.string().trim().min(1),
  is_main_meter: z.boolean(),
});

export const CreatePropertyDTOSchema = z
  .object({
    room_name: z.string().trim().min(1).max(255).transform(stripHtml),
    tenant_amount: z.number().int().min(1),
    meter_groups: z.record(
      z.enum(Object.values(UTILITY_TYPES) as [string, ...string[]]),
      MeterGroupEntrySchema.optional()
    ),
  })
  .refine(
    (data) =>
      Object.values(data.meter_groups).some((v) => v !== undefined),
    {
      message: "Property must have at least one meter group (electricity or water)",
      path: ["meter_groups"],
    }
  );
export type CreatePropertyDTO = z.infer<typeof CreatePropertyDTOSchema>;

export const CreatePropertyBatchDTOSchema = z
  .array(CreatePropertyDTOSchema)
  .min(1)
  .max(10);
export type CreatePropertyBatchDTO = z.infer<typeof CreatePropertyBatchDTOSchema>;

export const PropertyByIdParamsDTOSchema = z.object({
  id: z.string().trim().min(1),
});
export type PropertyByIdParamsDTO = z.infer<typeof PropertyByIdParamsDTOSchema>;

const UpdatePropertyBaseDTOSchema = z.object({
  room_name: z.string().trim().min(1).max(255).transform(stripHtml).optional(),
  tenant_amount: z.number().int().min(1).optional(),
  meter_groups: z.record(
    z.enum(Object.values(UTILITY_TYPES) as [string, ...string[]]),
    MeterGroupEntrySchema.optional()
  ).optional(),
});

export const UpdatePropertyDTOSchema = UpdatePropertyBaseDTOSchema;
export type UpdatePropertyDTO = z.infer<typeof UpdatePropertyDTOSchema>;

export const UpdatePropertyBatchItemSchema = z.object({
  id: z.string().min(1),
  data: UpdatePropertyDTOSchema,
});

export const UpdatePropertyBatchDTOSchema = z
  .array(UpdatePropertyBatchItemSchema)
  .min(1)
  .max(10);
export type UpdatePropertyBatchDTO = z.infer<typeof UpdatePropertyBatchDTOSchema>;

export const GetPropertiesQueryDTOSchema = z.object({
  roomName: z.string().trim().min(1).max(255).optional(),
  meterGroupId: z.string().trim().min(1).optional(),
  sortBy: z.enum(["created_at", "room_name"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().trim().min(1).optional(),
  archived: z.enum(["true", "false"]).optional().transform(
    (val) => val === "true"
  ),
});
export type GetPropertiesQueryDTO = z.infer<typeof GetPropertiesQueryDTOSchema>;
