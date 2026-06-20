import type { FacilityRef, FacilityRoles } from "@/types/auth";

export interface User {
  id: string;
  email: string;
  medical_id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  is_active: boolean;
  account_status: string;
  /** Roles grouped by facility. */
  facility_roles: FacilityRoles[];
  /** Global (facility-less) roles, e.g. SUPER_ADMIN. */
  global_roles: string[];
  facilities: FacilityRef[];
  created_at: string;
}

export interface CreateUserPayload {
  email?: string;
  medical_id: string;
  first_name: string;
  last_name: string;
  phone?: string;
  password: string;
}

export interface UpdateUserPayload {
  first_name?: string;
  last_name?: string;
  phone?: string;
  email?: string;
}

export interface AssignUserPayload {
  medical_id: string;
  roles: string[];
}

export interface UserStatusPayload {
  account_status: string;
}
