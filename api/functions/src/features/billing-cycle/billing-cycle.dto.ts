import {z} from "zod";
import {parseTimestamp} from "../../utils/firestore.util";
import {ImageUrlSchema} from "../../utils/image-url.util";

// Create DTOS
const BillingCycleBaseSchema = z.object({
  meter_group_id: z.string().trim().min(1),
  billing_ids: z
    .record(z.string(), z.number().nonnegative())
    .refine(
      (obj) => Object.keys(obj).length > 0,
      "billing_ids must not be empty"
    ),
  billing_rate: z.number().nonnegative(),
  billing_consumption: z.number().nonnegative(),
  billing_start_date: z.unknown()
    .refine((v) => v !== undefined && v !== null, {message: "billing_start_date is required"})
    .transform((val) => parseTimestamp(val as NonNullable<unknown>)),
  billing_end_date: z.unknown()
    .refine((v) => v !== undefined && v !== null, {message: "billing_end_date is required"})
    .transform((val) => parseTimestamp(val as NonNullable<unknown>)),
  overdue_date: z.unknown().transform((val) => val ? parseTimestamp(val) : undefined).optional(),
});

export const CreateBillingCycleDTOSchema = BillingCycleBaseSchema.refine(
  (data) => data.billing_start_date < data.billing_end_date,
  {
    message: "billing_start_date must be before billing_end_date",
    path: ["billing_end_date"],
  }
);
export type CreateBillingCycleDTO = z.infer<typeof CreateBillingCycleDTOSchema>;

export const CreateBillingCycleBatchDTOSchema = z.array(
  CreateBillingCycleDTOSchema
).min(1).max(10);
export type CreateBillingCycleBatchDTO = z.infer<typeof CreateBillingCycleBatchDTOSchema>;

// Update DTOS
const UpdateBillingCycleBaseSchema = z.object({
  meter_group_id: z.string().trim().min(1).optional(),
  billing_ids: z
    .record(z.string(), z.number().nonnegative())
    .optional(),
  billing_rate: z.number().nonnegative().optional(),
  billing_consumption: z.number().nonnegative().optional(),
  billing_start_date: z.unknown().transform((val) => val ? parseTimestamp(val) : undefined).optional(),
  billing_end_date: z.unknown().transform((val) => val ? parseTimestamp(val) : undefined).optional(),
  overdue_date: z.unknown().transform((val) => val ? parseTimestamp(val) : undefined).optional(),
});

export const UpdateBillingCycleDTOSchema = UpdateBillingCycleBaseSchema.refine(
  (data) => {
    if (data.billing_start_date && data.billing_end_date) {
      return data.billing_start_date < data.billing_end_date;
    }
    return true;
  },
  {
    message: "billing_start_date must be before billing_end_date",
    path: ["billing_end_date"],
  }
);
export type UpdateBillingCycleDTO = z.infer<typeof UpdateBillingCycleDTOSchema>;

export const UpdateBillingCycleBatchItemSchema = z.object({
  id: z.string().min(1),
  data: UpdateBillingCycleDTOSchema,
});
export const UpdateBillingCycleBatchDTOSchema = z
  .array(UpdateBillingCycleBatchItemSchema)
  .min(1)
  .max(10);
export type UpdateBillingCycleBatchDTO = z.infer<typeof UpdateBillingCycleBatchDTOSchema>;

export const BillingCycleByIdParamsDTOSchema = z.object({
  id: z.string().trim().min(1),
});
export type BillingCycleByIdParamsDTO = z.infer<typeof BillingCycleByIdParamsDTOSchema>;

export const GetBillingCyclesQueryDTOSchema = z
  .object({
    meterGroupId: z.string().trim().min(1).optional(),
    billingStartDate: z.string().datetime().optional(),
    billingEndDate: z.string().datetime().optional(),
    sortBy: z.enum(["created_at", "billing_start_date"]).optional(),
    sortOrder: z.enum(["asc", "desc"]).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().trim().min(1).optional(),
    archived: z.enum(["true", "false"]).optional().transform(
      (val) => val === "true"
    ),
  })
  .superRefine((value, context) => {
    if ((value.billingStartDate || value.billingEndDate) && value.cursor) {
      context.addIssue({
        code: "custom",
        message: "cursor cannot be combined with billingStartDate " +
          "or billingEndDate",
        path: ["cursor"],
      });
    }
    if (value.meterGroupId && value.cursor) {
      context.addIssue({
        code: "custom",
        message: "cursor cannot be combined with meterGroupId",
        path: ["cursor"],
      });
    }
  });
export type GetBillingCyclesQueryDTO = z.infer<typeof GetBillingCyclesQueryDTOSchema>;

// OCR DTOs
export const OcrBillingCycleDTOSchema = z.object({
  image_url: ImageUrlSchema,
});
export type OcrBillingCycleDTO = z.infer<typeof OcrBillingCycleDTOSchema>;

export const OcrBillingCycleResponseSchema = z.object({
  billing_start_date: z.string(),
  billing_end_date: z.string(),
  billing_consumption: z.number(),
  billing_rate: z.number(),
  raw_amount: z.number(),
});
export type OcrBillingCycleResponse = z.infer<typeof OcrBillingCycleResponseSchema>;
