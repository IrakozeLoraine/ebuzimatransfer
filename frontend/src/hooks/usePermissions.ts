import { useAuthStore } from "@/store/auth.store";
import type { UserRole } from "@/types/auth";

export const usePermissions = () => {
  const user = useAuthStore((s) => s.user);

  const hasRole = (...roles: UserRole[]): boolean =>
    roles.some((r) => user?.roles.includes(r));

  const isSuperAdmin = hasRole("SUPER_ADMIN");
  const isFacilityAdmin = hasRole("FACILITY_ADMIN");
  const isICUCoordinator = hasRole("ICU_COORDINATOR");
  const isAdmin = isSuperAdmin || isFacilityAdmin;
  const isClinician = hasRole("REFERRING_CLINICIAN");
  const isAmbulance = hasRole("AMBULANCE_COORDINATOR");

  const canViewReports = isSuperAdmin;
  const canManageFacilities = isSuperAdmin;
  const canViewAudit = isAdmin;
  const canManageResources = isAdmin || isICUCoordinator;
  const canAssignResources = isAdmin;
  const canAcceptReferral = isFacilityAdmin || isICUCoordinator;
  const canCreateReferral = isClinician;
  const canManageTransport = isAmbulance;
  const canViewResources = isSuperAdmin || isFacilityAdmin || isICUCoordinator || isAmbulance || isClinician;

  return {
    hasRole,
    isSuperAdmin,
    isFacilityAdmin,
    isICUCoordinator,
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
