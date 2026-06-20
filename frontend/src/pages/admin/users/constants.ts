export const SUPER_ADMIN_ROLES = [
  "REFERRING_CLINICIAN",
  "ICU_COORDINATOR",
  "AMBULANCE_COORDINATOR",
  "FACILITY_ADMIN",
  "SUPER_ADMIN",
];

/** Roles that can be granted to a user within a facility (SUPER_ADMIN is global-only). */
export const FACILITY_ASSIGNABLE_ROLES = SUPER_ADMIN_ROLES.filter((r) => r !== "SUPER_ADMIN");

const ROLE_COLORS: Record<string, string> = {
  SUPER_ADMIN: "bg-teal-50 text-teal-700 ring-1 ring-teal-200",
  FACILITY_ADMIN: "bg-violet-50 text-violet-700 ring-1 ring-violet-200",
  ICU_COORDINATOR: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  REFERRING_CLINICIAN: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  AMBULANCE_COORDINATOR: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
};

export const getRoleColor = (name: string) =>
  ROLE_COLORS[name] ?? "bg-muted text-muted-foreground ring-1 ring-border";

export const ACCOUNT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  PASSWORD_RESET_ENABLED: "Reset Required",
};
