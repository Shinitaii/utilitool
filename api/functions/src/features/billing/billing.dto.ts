import {z} from "zod";

// Create DTOS
export const CreateBillingDTOSchema = z.object({
  property_id: z.string().trim().min(1),
  previous_reading_id: z.string().trim().min(1),
  current_reading_id: z.string().trim().min(1),
});
export type CreateBillingDTO = z.infer<typeof CreateBillingDTOSchema>;

export const CreateBillingBatchDTOSchema = z.array(
  CreateBillingDTOSchema
).min(1).max(10);
export type CreateBillingBatchDTO = z.infer<typeof CreateBillingBatchDTOSchema>;

// Update DTOS
export const UpdateBillingDTOSchema = CreateBillingDTOSchema.partial().extend({
  payment_status: z.enum(["pending", "paid"]).optional(),
  paid_at: z.string().datetime().optional(),
});
export type UpdateBillingDTO = z.infer<typeof UpdateBillingDTOSchema>;

export const UpdateBillingBatchItemSchema = z.object({
  id: z.string().min(1),
  data: UpdateBillingDTOSchema,
});
export const UpdateBillingBatchDTOSchema = z.array(
  UpdateBillingBatchItemSchema
).min(1).max(10);
export type UpdateBillingBatchDTO = z.infer<typeof UpdateBillingBatchDTOSchema>;

export const BillingByIdParamsDTOSchema = z.object({
  id: z.string().trim().min(1),
});
export type BillingByIdParamsDTO = z.infer<typeof BillingByIdParamsDTOSchema>;

export const GetBillingsQueryDTOSchema = z
  .object({
    propertyId: z.string().trim().min(1).optional(),
    sortBy: z.enum(["created_at", "payment_status"]).optional(),
    sortOrder: z.enum(["asc", "desc"]).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().trim().min(1).optional(),
    archived: z.enum(["true", "false"]).optional().transform(
      (val) => val === "true"
    ),
  })
  .superRefine((value, context) => {
    if (value.propertyId && value.cursor) {
      context.addIssue({
        code: "custom",
        message: "cursor cannot be combined with propertyId",
        path: ["cursor"],
      });
    }
  });
export type GetBillingsQueryDTO = z.infer<typeof GetBillingsQueryDTOSchema>;
