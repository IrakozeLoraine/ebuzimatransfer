export type ReferralStatus =
  | "REQUESTED"
  | "UNDER_REVIEW"
  | "ACCEPTED"
  | "TRANSPORT_ARRANGED"
  | "EN_ROUTE"
  | "ARRIVED"
  | "REJECTED"
  | "CANCELLED";

export type ArrivalCondition =
  | "STABLE"
  | "CRITICAL"
  | "DETERIORATED"
  | "ARRIVED_DECEASED";

export interface StatusHistory {
  id: string;
  status: ReferralStatus;
  changed_by: string;
  comment: string | null;
  created_at: string;
}

export interface ReferralTransport {
  id: string;
  ambulance_id: string | null;
  ambulance_identifier: string;
  driver_name: string | null;
  driver_phone: string | null;
  dispatch_time: string | null;
  pickup_time: string | null;
  departure_time: string | null;
  arrival_time: string | null;
}

/** The Patient Monitoring Transfer Form recorded by the ambulance driver by voice. */
export interface TransportMonitoring {
  audio_url: string | null;
  transcript: string;
  summary: string;
  vital_signs: Array<Record<string, string | null>>;
  problems: Array<Record<string, string | null>>;
  recorded_at: string | null;
}

export interface Referral {
  id: string;
  referral_number: string;
  sex: string;
  diagnosis: string;
  reason_for_transfer: string;
  form_type: string;
  form_data: Record<string, unknown> | null;
  transport_monitoring: TransportMonitoring | null;
  feedback_data: Record<string, unknown> | null;
  counter_referral_data: Record<string, unknown> | null;
  audio_url: string | null;
  transcript: string | null;
  ai_summary: string | null;
  status: ReferralStatus;
  rejection_reason: string | null;
  rejection_comment: string | null;
  created_by: string;
  arrival_condition: string | null;
  referring_facility_id: string | null;
  preferred_facility_id: string | null;
  accepted_facility_id: string | null;
  origin_unit_id: string | null;
  requested_unit_id: string | null;
  requested_resource_id: string | null;
  requested_resource_name: string | null;
  created_at: string;
  updated_at: string;
  status_history: StatusHistory[];
  transport_events: ReferralTransport[];
}

export interface CreateReferralPayload {
  sex: string;
  diagnosis: string;
  reason_for_transfer: string;
  form_type: string;
  form_data?: Record<string, unknown> | null;
  preferred_facility_id?: string;
  requested_unit_id?: string;
  requested_resource_id: string;
  audio_url?: string;
  transcript?: string;
  ai_summary?: string;
  /** Links a pre-form coordination call to the referral being created. */
  call_log_id?: string;
}

/** Form fields extracted from a dictated transcript (all optional — reviewed by the clinician). */
export interface DictationFields {
  sex?: string | null;
  diagnosis?: string | null;
  reason_for_transfer?: string | null;
}

/** Response of POST /referrals/transcribe. */
export interface DictationResult {
  audio_url: string | null;
  transcript: string;
  summary: string;
  fields: DictationFields;
  /** Form-specific values extracted for the chosen MoH form (keyed by field name). */
  form_data?: Record<string, unknown>;
}

export interface AcceptReferralPayload {
  resource_id: string;
  planned_admission_time?: string;
}

export interface RejectReferralPayload {
  reason: string;
  comment?: string;
}
