import {UTILITY_TYPES} from "../../constants/utility.constants";
import {z} from "zod";
import {stripHtml} from "../../utils/sanitize.util";

// Create DTOS
export const CreateMeterGroupDTOSchema = z.object({
  meter_name: z.string().trim().min(1).max(255).transform(stripHtml),
  utility_type: z.enum(Object.values(UTILITY_TYPES)),
});
export type CreateMeterGroupDTO = z.infer<typeof CreateMeterGroupDTOSchema>;

export const CreateMeterGroupBatchDTOSchema = z.array(
  CreateMeterGroupDTOSchema
).min(1).max(10);
export type CreateMeterGroupBatchDTO = z.infer<typeof CreateMeterGroupBatchDTOSchema>;

// Update DTOS
export const UpdateMeterGroupDTOSchema = CreateMeterGroupDTOSchema.partial();
export type UpdateMeterGroupDTO = z.infer<typeof UpdateMeterGroupDTOSchema>;

export const UpdateMeterGroupBatchItemSchema = z.object({
  id: z.string().min(1),
  data: UpdateMeterGroupDTOSchema,
});
export const UpdateMeterGroupBatchDTOSchema = z.array(
  UpdateMeterGroupBatchItemSchema
).min(1).max(10);
export type UpdateMeterGroupBatchDTO = z.infer<typeof UpdateMeterGroupBatchDTOSchema>;

export const MeterGroupByIdParamsDTOSchema = z.object({
  id: z.string().trim().min(1),
});
export type MeterGroupByIdParamsDTO = z.infer<typeof MeterGroupByIdParamsDTOSchema>;

export const GetMeterGroupsQueryDTOSchema = z
  .object({
    meterName: z.string().trim().min(1).max(255).optional(),
    utilityType: z.enum(Object.values(UTILITY_TYPES)).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().trim().min(1).optional(),
  })
  .superRefine((value, context) => {
    if (value.meterName && value.cursor) {
      context.addIssue({
        code: "custom",
        message: "cursor cannot be combined with meterName",
        path: ["cursor"],
      });
    }
  });
export type GetMeterGroupsQueryDTO = z.infer<typeof GetMeterGroupsQueryDTOSchema>;
