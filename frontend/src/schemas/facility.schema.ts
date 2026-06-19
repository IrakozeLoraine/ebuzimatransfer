import { z } from "zod";

export const facilitySchema = z.object({
  name: z.string().min(1, "Required"),
  type: z.string().min(1, "Required"),
  location: z.string().optional(),
  province: z.string().optional(),
  district: z.string().optional(),
});

export type FacilityFormValues = z.infer<typeof facilitySchema>;
