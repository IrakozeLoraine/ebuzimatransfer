export interface LoginRequest {
  medical_id: string;
  password?: string;
}

export interface SetPasswordRequest {
  reset_token: string;
  new_password: string;
}

export interface TokenResponse {
  access_token?: string | null;
  refresh_token?: string | null;
  token_type: string;
  requires_password_reset: boolean;
  reset_token?: string | null;
}

export interface FacilityRef {
  id: string;
  name: string;
}

export interface UserMe {
  id: string;
  email: string;
  medical_id: string;
  first_name: string;
  last_name: string;
  roles: string[];
  facilities: FacilityRef[];
  account_status: string;
}

export type UserRole =
  | "REFERRING_CLINICIAN"
  | "ICU_COORDINATOR"
  | "FACILITY_ADMIN"
  | "AMBULANCE_COORDINATOR"
  | "SUPER_ADMIN";
