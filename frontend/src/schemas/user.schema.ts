import { z } from "zod";

export const userSchema = z.object({
  email: z.string().email(),
  medical_id: z.string().min(3, "Medical ID is required"),
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  phone: z.string().optional(),
  password: z.string().min(8, "Min 8 characters"),
  role: z.string().min(1, "Select a role"),
});

export const assignUserSchema = z.object({
  medical_id: z.string().min(3, "Medical ID is required"),
});

export type UserFormValues = z.infer<typeof userSchema>;
export type AssignUserFormValues = z.infer<typeof assignUserSchema>;
