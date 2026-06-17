import { z } from "zod";

export const medicalIdSchema = z.object({
  medical_id: z.string().min(3, "Medical ID is required"),
});

export const passwordSchema = z.object({
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const setPasswordSchema = z
  .object({
    new_password: z.string().min(8, "Password must be at least 8 characters"),
    confirm_password: z.string().min(1, "Please confirm your password"),
  })
  .refine((d) => d.new_password === d.confirm_password, {
    message: "Passwords do not match",
    path: ["confirm_password"],
  });

export type MedicalIdFormValues = z.infer<typeof medicalIdSchema>;
export type PasswordFormValues = z.infer<typeof passwordSchema>;
export type SetPasswordFormValues = z.infer<typeof setPasswordSchema>;
