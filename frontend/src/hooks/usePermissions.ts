import { useAuthStore } from "@/store/auth.store";
import type { UserRole } from "@/types/auth";

export const usePermissions = () => {
  const user = useAuthStore((s) => s.user);

  const hasRole = (...roles: UserRole[]): boolean =>
    roles.some((r) => user?.roles.includes(r));

  const isSuperAdmin = hasRole("SUPER_ADMIN");
  const isFacilityAdmin = hasRole("FACILITY_ADMIN");
  const isAdmin = isSuperAdmin || isFacilityAdmin;
  // A single clinician role; "referring" vs "receiving" is contextual, not a role.
  const isClinician = hasRole("CLINICIAN");

  const canManageFacilities = isSuperAdmin;
  const canViewAudit = isAdmin;
  const canManageResources = isAdmin || isClinician;
  const canAssignResources = isAdmin;
  const canUpdateResourceStatus = isFacilityAdmin || isClinician;
  // Any clinician can create a transfer request (referring) and act on one that
  // targets their facility (receiving); admins can too.
  const canCreateReferral = isClinician;
  const canAcceptReferral = isClinician;
  // Transport is arranged by the referring clinician (each hospital runs its own
  // ambulances); admins can act on any request too.
  const canManageTransport = isClinician || isSuperAdmin;
  const canViewResources = isSuperAdmin || isFacilityAdmin || isClinician;

  return {
    hasRole,
    isSuperAdmin,
    isFacilityAdmin,
    isAdmin,
    isClinician,
    canManageFacilities,
    canViewAudit,
    canManageResources,
    canAssignResources,
    canUpdateResourceStatus,
    canAcceptReferral,
    canCreateReferral,
    canManageTransport,
    canViewResources,
  };
};
