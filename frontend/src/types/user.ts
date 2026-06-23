import type { FacilityRef, FacilityRoles } from "@/types/auth";

export interface User {
  id: string;
  email: string;
  medical_id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  location: string | null;
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
  /** Clinical units the user works in at this facility. */
  unit_ids?: string[];
}

export interface CreateAssignPayload extends CreateUserPayload {
  roles: string[];
  /** Clinical units the user works in at this facility. */
  unit_ids?: string[];
  /** Required for super admins; facility admins use their own active facility. */
  facility_id?: string;
}

export interface UserStatusPayload {
  account_status: string;
}
