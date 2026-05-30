import {z} from "zod";

export const UserProfileResponseDTOSchema = z.object({
  userId: z.string(),
  email: z.string(),
  display_name: z.string(),
  role: z.enum(["admin", "landlord", "assistant"]),
  qr_payment_url: z.string().optional(),
});
export type UserProfileResponseDTO = z.infer<typeof UserProfileResponseDTOSchema>;

export const UpdateUserProfileDTOSchema = z.object({
  display_name: z.string().optional(),
  qr_payment_url: z.string().url().optional(),
});
export type UpdateUserProfileDTO = z.infer<typeof UpdateUserProfileDTOSchema>;
