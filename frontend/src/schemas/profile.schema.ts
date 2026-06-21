import { z } from "zod";

export const editProfileSchema = z.object({
  email: z
    .string()
    .optional()
    .refine((email) => !email || z.string().email("Invalid email address").safeParse(email).success, {
      message: "Invalid email address",
    }),
  phone: z.string().optional(),
  location: z.string().optional(),
});

export const changePasswordSchema = z
  .object({
    current_password: z.string().min(1, "Current password is required"),
    new_password: z.string().min(8, "Password must be at least 8 characters"),
    confirm_password: z.string().min(1, "Please confirm your password"),
  })
  .refine((d) => d.new_password === d.confirm_password, {
    message: "Passwords do not match",
    path: ["confirm_password"],
  });

export type EditProfileFormValues = z.infer<typeof editProfileSchema>;
export type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>;
