import {z} from "zod";

export const LoginDTOSchema = z.object({
  email: z.string().trim().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
export type LoginDTO = z.infer<typeof LoginDTOSchema>;

export const RegisterDTOSchema = z.object({
  email: z.string().trim().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
export type RegisterDTO = z.infer<typeof RegisterDTOSchema>;

export const RefreshTokenDTOSchema = z.object({
  refresh_token: z.string().trim().min(1, "Refresh token is required"),
});
export type RefreshTokenDTO = z.infer<typeof RefreshTokenDTOSchema>;

export const LoginResponseDTOSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number(),
  token_type: z.literal("Bearer"),
});
export type LoginResponseDTO = z.infer<typeof LoginResponseDTOSchema>;

export const RefreshResponseDTOSchema = z.object({
  access_token: z.string(),
  expires_in: z.number(),
  token_type: z.literal("Bearer"),
});
export type RefreshResponseDTO = z.infer<typeof RefreshResponseDTOSchema>;
