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
  const isAmbulance = hasRole("AMBULANCE_COORDINATOR");

  const canViewReports = isSuperAdmin;
  const canManageFacilities = isSuperAdmin;
  const canViewAudit = isAdmin;
  const canManageResources = isAdmin || isClinician;
  const canAssignResources = isAdmin;
  // Any clinician can create a transfer request (referring) and act on one that
  // targets their facility (receiving); admins can too.
  const canCreateReferral = isClinician || isSuperAdmin;
  const canAcceptReferral = isClinician || isAdmin;
  const canManageTransport = isAmbulance || isSuperAdmin;
  const canViewResources = isSuperAdmin || isFacilityAdmin || isAmbulance || isClinician;

  return {
    hasRole,
    isSuperAdmin,
    isFacilityAdmin,
    isAdmin,
    isClinician,
    isAmbulance,
    canViewReports,
    canManageFacilities,
    canViewAudit,
    canManageResources,
    canAssignResources,
    canAcceptReferral,
    canCreateReferral,
    canManageTransport,
    canViewResources,
  };
};
