export type InAppCallStatus =
  | "RINGING"
  | "ONGOING"
  | "ENDED"
  | "DECLINED"
  | "MISSED"
  | "CANCELLED";

export interface InAppCall {
  id: string;
  /** Null when the caller is an ambulance (driver app) rather than a clinician. */
  caller_id: string | null;
  caller_name: string | null;
  /** Facility the call was placed from. */
  caller_facility_id: string | null;
  caller_facility_name: string | null;
  /** Set when the caller is an ambulance. */
  caller_ambulance_id: string | null;
  callee_facility_id: string;
  callee_facility_name: string | null;
  /** Clinical unit that was called (its clinicians are rung). */
  callee_unit_id: string | null;
  callee_unit_name: string | null;
  callee_id: string | null;
  callee_name: string | null;
  /** Set when the callee is an ambulance (a clinician called the ambulance). */
  callee_ambulance_id: string | null;
  referral_id: string | null;
  status: InAppCallStatus;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

/** A relayed WebRTC signaling message kind. */
export type SignalKind = "offer" | "answer" | "ice";
