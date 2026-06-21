import { z } from "zod";

export const newReferralSchema = z.object({
  patient_code: z.string().min(1, "Required"),
  age_band: z.string().min(1, "Required"),
  sex: z.string().min(1, "Required"),
  diagnosis: z.string().min(5, "Provide a diagnosis"),
  comorbidities: z.string().optional(),
  acuity_level: z.string().min(1, "Required"),
  urgency: z.string().min(1, "Required"),
  reason_for_transfer: z.string().min(10, "Provide a reason for transfer"),
  ventilator_needed: z.boolean(),
  high_flow_oxygen_needed: z.boolean(),
  preferred_facility_id: z.string().optional(),
  requested_unit_id: z.string().optional(),
});

export type NewReferralFormValues = z.infer<typeof newReferralSchema>;

export const rejectReferralSchema = z.object({
  reason: z.string().min(1, "Reason required"),
  comment: z.string().optional(),
});

export type RejectReferralForm = z.infer<typeof rejectReferralSchema>;
