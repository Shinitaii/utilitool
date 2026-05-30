import {z} from "zod";

export const ReportQueryDTOSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  meterGroupId: z.string().optional(),
  propertyId: z.string().optional(),
});

export type ReportQueryDTO = z.infer<typeof ReportQueryDTOSchema>;
