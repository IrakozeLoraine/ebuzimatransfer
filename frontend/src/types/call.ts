export type PhoneLineType =
  | "EMERGENCY"
  | "COORDINATION"
  | "SUPERVISOR"
  | "TOLLFREE"
  | "DISPATCH"
  | "OTHER";

export interface PhoneLine {
  id: string;
  facility_id: string;
  label: string;
  phone_number: string;
  line_type: PhoneLineType;
  is_active: boolean;
}

export interface CreatePhoneLinePayload {
  label: string;
  phone_number: string;
  line_type: PhoneLineType;
  is_active?: boolean;
}

export interface PhoneLineImportError {
  row: number;
  message: string;
}

export interface PhoneLineImportResult {
  created: number;
  errors: PhoneLineImportError[];
}

export interface CallLog {
  id: string;
  referral_id: string | null;
  to_facility_id: string | null;
  to_number: string;
  from_line_id: string | null;
  purpose: string | null;
  notes: string | null;
  placed_by: string;
  placed_by_name: string | null;
  from_line_label: string | null;
  created_at: string;
}

export interface LogCallPayload {
  to_number: string;
  to_facility_id?: string;
  from_line_id?: string;
  referral_id?: string;
  purpose?: string;
  notes?: string;
}
