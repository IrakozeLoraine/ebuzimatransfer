import { z } from "zod";

export const resourceSchema = z.object({
  unit_id: z.string().uuid("Please select a unit").optional().or(z.literal("")),
  facility_id: z.string().uuid().optional().or(z.literal("")),
  resource_name: z.string().min(2, "Resource name is required"),
  resource_code: z.string().optional(),
  resource_type: z.string().optional(),
  quantity: z.number().int().min(1, "Quantity must be at least 1").default(1),
  notes: z.string().optional(),
});

export type ResourceFormValues = z.infer<typeof resourceSchema>;

export const assignResourceSchema = z.object({
  facility_id: z.string().uuid().optional().or(z.literal("")),
  unit_id: z.string().uuid().optional().or(z.literal("")),
});

export type AssignResourceFormValues = z.infer<typeof assignResourceSchema>;
