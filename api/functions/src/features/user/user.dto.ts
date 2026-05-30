import {z} from "zod";

export const CreateUserDTOSchema = z.object({
  uid: z.string().min(1, "uid is required"),
  role: z.enum(["admin", "landlord", "assistant"], {
    message: "role must be admin, landlord, or assistant",
  }),
});

export type CreateUserDTO = z.infer<typeof CreateUserDTOSchema>;
