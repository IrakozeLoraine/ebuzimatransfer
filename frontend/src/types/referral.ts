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

export interface Referral {
  id: string;
  referral_number: string;
  patient_code: string;
  age_band: string;
  sex: string;
  diagnosis: string;
  comorbidities: string | null;
  acuity_level: string;
  urgency: string;
  reason_for_transfer: string;
  ventilator_needed: boolean;
  high_flow_oxygen_needed: boolean;
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
  created_at: string;
  updated_at: string;
  status_history: StatusHistory[];
}

export interface CreateReferralPayload {
  patient_code: string;
  age_band: string;
  sex: string;
  diagnosis: string;
  comorbidities?: string;
  acuity_level: string;
  urgency: string;
  reason_for_transfer: string;
  ventilator_needed: boolean;
  high_flow_oxygen_needed: boolean;
  preferred_facility_id?: string;
  requested_unit_id?: string;
}

export interface AcceptReferralPayload {
  resource_id: string;
  planned_admission_time?: string;
}

export interface RejectReferralPayload {
  reason: string;
  comment?: string;
}
