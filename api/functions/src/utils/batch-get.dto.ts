import {z} from "zod";

/**
 * Shared `GET /:feature/batch-get?ids=a,b,c` query schema — comma-separated IDs,
 * capped to match the entity-lookup-cache.ts client's realistic per-page batch size.
 */
export const BatchGetQueryDTOSchema = z.object({
  ids: z
    .string()
    .trim()
    .min(1)
    .transform((val) => Array.from(new Set(val.split(",").map((s) => s.trim()).filter(Boolean))))
    .pipe(z.array(z.string()).min(1).max(100)),
});
export type BatchGetQueryDTO = z.infer<typeof BatchGetQueryDTOSchema>;
