import { z } from "zod";

export const newReferralSchema = z.object({
  sex: z.string().min(1, "Required"),
  diagnosis: z.string().min(1, "Provide a diagnosis"),
  reason_for_transfer: z.string().min(1, "Provide a reason for transfer"),
  // Which MoH form variant was used, plus its form-specific field values.
  form_type: z.string().min(1),
  form_data: z.record(z.string(), z.unknown()).optional(),
  preferred_facility_id: z.string().min(1, "Select a destination facility"),
  requested_unit_id: z.string().min(1, "Select a requested unit"),
  requested_resource_id: z.string().min(1, "Select an available resource"),
  // Voice-dictation artifacts, carried with the form when a recording was used.
  audio_url: z.string().optional(),
  transcript: z.string().optional(),
  ai_summary: z.string().optional(),
  // Links a coordination call placed before the form was filled to this referral.
  call_log_id: z.string().optional(),
});

export type NewReferralFormValues = z.infer<typeof newReferralSchema>;

export const rejectReferralSchema = z.object({
  reason: z.string().min(1, "Reason required"),
  comment: z.string().optional(),
});

export type RejectReferralForm = z.infer<typeof rejectReferralSchema>;
