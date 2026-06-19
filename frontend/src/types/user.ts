import type { FacilityRef } from "@/types/auth";

export interface User {
  id: string;
  email: string;
  medical_id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  is_active: boolean;
  account_status: string;
  roles: { id: string; name: string }[];
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
  roles: string[];
}

export interface UpdateUserPayload {
  first_name?: string;
  last_name?: string;
  phone?: string;
  email?: string;
  roles?: string[];
}

export interface AssignUserPayload {
  medical_id: string;
}

export interface UserStatusPayload {
  account_status: string;
}
