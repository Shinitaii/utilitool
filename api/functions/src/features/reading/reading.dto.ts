import {z} from "zod";
import {parseTimestamp} from "../../utils/firestore.util";

// Create DTOS
export const CreateReadingDTOSchema = z.object({
  meter_group_id: z.string().trim().min(1),
  property_id: z.string().trim().min(1),
  reading_amount: z.number().int().min(0),
  reading_date: z.unknown().transform((val) => parseTimestamp(val)),
  image_url: z.url().optional(),
});
export type CreateReadingDTO = z.infer<typeof CreateReadingDTOSchema>;

export const CreateSeedReadingDTOSchema = CreateReadingDTOSchema;
export type CreateSeedReadingDTO = z.infer<typeof CreateSeedReadingDTOSchema>;

// OCR DTOS
export const OcrReadingDTOSchema = z.object({
  image_url: z.url(),
});
export type OcrReadingDTO = z.infer<typeof OcrReadingDTOSchema>;

export const OcrReadingResponseSchema = z.object({
  suggested_reading_amount: z.number().int().nullable(),
});
export type OcrReadingResponse = z.infer<typeof OcrReadingResponseSchema>;

export const CreateReadingBatchDTOSchema = z.array(
  CreateReadingDTOSchema
).min(1).max(10);
export type CreateReadingBatchDTO = z.infer<typeof CreateReadingBatchDTOSchema>;

// Update DTOS
export const UpdateReadingDTOSchema = CreateReadingDTOSchema.partial();
export type UpdateReadingDTO = z.infer<typeof UpdateReadingDTOSchema>;

export const UpdateReadingBatchItemSchema = z.object({
  id: z.string().min(1),
  data: UpdateReadingDTOSchema,
});
export const UpdateReadingBatchDTOSchema = z.array(
  UpdateReadingBatchItemSchema
).min(1).max(10);
export type UpdateReadingBatchDTO = z.infer<typeof UpdateReadingBatchDTOSchema>;

export const ReadingByIdParamsDTOSchema = z.object({
  id: z.string().trim().min(1),
});
export type ReadingByIdParamsDTO = z.infer<typeof ReadingByIdParamsDTOSchema>;

export const GetReadingsQueryDTOSchema = z
  .object({
    meterGroupId: z.string().trim().min(1).optional(),
    propertyId: z.string().trim().min(1).optional(),
    sortBy: z.enum(["created_at", "reading_date"]).optional(),
    sortOrder: z.enum(["asc", "desc"]).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().trim().min(1).optional(),
    archived: z.enum(["true", "false"]).optional().transform(
      (val) => val === "true"
    ),
  })
  .superRefine((value, context) => {
    if (value.meterGroupId && value.cursor) {
      context.addIssue({
        code: "custom",
        message: "cursor cannot be combined with meterGroupId",
        path: ["cursor"],
      });
    }
    if (value.propertyId && value.cursor) {
      context.addIssue({
        code: "custom",
        message: "cursor cannot be combined with propertyId",
        path: ["cursor"],
      });
    }
  });
export type GetReadingsQueryDTO = z.infer<typeof GetReadingsQueryDTOSchema>;
