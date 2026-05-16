import {z} from "zod";
import {Timestamp} from "firebase-admin/firestore";

// Create DTOS
const BillingCycleBaseSchema = z.object({
  billing_ids: z
    .record(z.string(), z.number().nonnegative())
    .refine(
      (obj) => Object.keys(obj).length > 0,
      "billing_ids must not be empty"
    ),
  billing_rate: z.number().nonnegative(),
  billing_consumption: z.number().nonnegative(),
  billing_start_date: z.instanceof(Timestamp),
  billing_end_date: z.instanceof(Timestamp),
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
export const UpdateBillingCycleDTOSchema = BillingCycleBaseSchema.partial().refine(
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
    billingStartDate: z.string().datetime().optional(),
    billingEndDate: z.string().datetime().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().trim().min(1).optional(),
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
  });
export type GetBillingCyclesQueryDTO = z.infer<typeof GetBillingCyclesQueryDTOSchema>;
