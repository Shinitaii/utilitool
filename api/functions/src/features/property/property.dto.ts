import {z} from "zod";
import {stripHtml} from "../../utils/sanitize.util";
import {UTILITY_TYPES} from "../../constants/utility.constants";

export const CreatePropertyDTOSchema = z
  .object({
    room_name: z.string().trim().min(1).max(255).transform(stripHtml),
    tenant_amount: z.number().int().min(1),
    meter_groups: z.record(
      z.enum(Object.values(UTILITY_TYPES)),
      z.string().trim().min(1)
    ),
  })
  .refine(
    (data) =>
      data.meter_groups[UTILITY_TYPES.ELECTRICITY] &&
      data.meter_groups[UTILITY_TYPES.WATER],
    {
      message:
        "Property must have both electricity and water meter groups",
      path: ["meter_groups"],
    }
  );
export type CreatePropertyDTO = z.infer<typeof CreatePropertyDTOSchema>;

export const CreatePropertyBatchDTOSchema = z
  .array(CreatePropertyDTOSchema)
  .min(1)
  .max(10);
export type CreatePropertyBatchDTO = z.infer<
  typeof CreatePropertyBatchDTOSchema
>;

export const PropertyByIdParamsDTOSchema = z.object({
  id: z.string().trim().min(1),
});
export type PropertyByIdParamsDTO = z.infer<typeof PropertyByIdParamsDTOSchema>;

export const UpdatePropertyDTOSchema = CreatePropertyDTOSchema.partial();
export type UpdatePropertyDTO = z.infer<typeof UpdatePropertyDTOSchema>;

export const UpdatePropertyBatchItemSchema = z.object({
  id: z.string().min(1),
  data: UpdatePropertyDTOSchema,
});

export const UpdatePropertyBatchDTOSchema = z
  .array(UpdatePropertyBatchItemSchema)
  .min(1)
  .max(10);
export type UpdatePropertyBatchDTO = z.infer<
  typeof UpdatePropertyBatchDTOSchema
>;

export const GetPropertiesQueryDTOSchema = z.object({
  roomName: z.string().trim().min(1).max(255).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().trim().min(1).optional(),
});
export type GetPropertiesQueryDTO = z.infer<typeof GetPropertiesQueryDTOSchema>;
