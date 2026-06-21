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

export interface FacilityRoles {
  facility: FacilityRef;
  roles: string[];
}

export interface UserMe {
  id: string;
  email: string;
  medical_id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  location: string | null;
  /** Roles effective in the active facility (global grants + active-facility grants). */
  roles: string[];
  active_facility_id: string | null;
  facilities: FacilityRef[];
  facility_roles: FacilityRoles[];
  account_status: string;
}

export interface UpdateProfilePayload {
  email?: string;
  phone?: string;
  location?: string;
}

export type UserRole =
  | "REFERRING_CLINICIAN"
  | "ICU_COORDINATOR"
  | "FACILITY_ADMIN"
  | "AMBULANCE_COORDINATOR"
  | "SUPER_ADMIN";
