import {z} from "zod";

export const CreateUserDTOSchema = z.object({
  email: z.email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  displayName: z.string().trim().optional(),
  role: z.enum(["admin", "landlord", "assistant"], {
    message: "role must be admin, landlord, or assistant",
  }),
});

export type CreateUserDTO = z.infer<typeof CreateUserDTOSchema>;
