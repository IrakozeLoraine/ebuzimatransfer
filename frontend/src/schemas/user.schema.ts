import { z } from "zod";

export const userSchema = z.object({
  email: z.string().optional().refine((email) => !email || z.string().email("Invalid email address").safeParse(email).success, {
    message: "Invalid email address",
  }),
  medical_id: z.string().min(3, "Medical ID is required"),
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  phone: z.string().optional(),
});

export const assignUserSchema = z.object({
  // Optional in the schema; presence is enforced per-context in the dialog
  // (the user is fixed on the user-details page, the facility on the facility page).
  medical_id: z.string().optional(),
  facility_id: z.string().optional(),
  roles: z.array(z.string({ message: "Role is required" }), { message: "Select at least one role" }).min(1, "Select at least one role"),
});

export const createAssignSchema = z.object({
  email: z.string().optional().refine((email) => !email || z.string().email("Invalid email address").safeParse(email).success, {
    message: "Invalid email address",
  }),
  medical_id: z.string().min(3, "Medical ID is required"),
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  phone: z.string().optional(),
  facility_id: z.string().optional(),
  roles: z.array(z.string(), { message: "Select at least one role" }).min(1, "Select at least one role"),
});

export const editUserSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().optional().refine((email) => !email || z.string().email("Invalid email address").safeParse(email).success, {
    message: "Invalid email address",
  }),
});

export type UserFormValues = z.infer<typeof userSchema>;
export type AssignUserFormValues = z.infer<typeof assignUserSchema>;
export type CreateAssignFormValues = z.infer<typeof createAssignSchema>;
export type EditUserFormValues = z.infer<typeof editUserSchema>;
