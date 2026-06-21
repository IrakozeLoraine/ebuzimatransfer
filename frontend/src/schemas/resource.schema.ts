import { z } from "zod";

export const resourceSchema = z.object({
  unit_id: z.string().uuid("Please select a unit"),
  resource_name: z.string().min(2, "Resource name is required"),
  resource_code: z.string().min(2, "Resource code is required"),
  resource_type: z.string().optional(),
  quantity: z.number().int().min(1, "Quantity must be at least 1").default(1),
  notes: z.string().optional(),
});

export type ResourceFormValues = z.infer<typeof resourceSchema>;
