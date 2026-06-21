import { useAuthStore } from "@/store/auth.store";
import type { UserRole } from "@/types/auth";

export const usePermissions = () => {
  const user = useAuthStore((s) => s.user);

  const hasRole = (...roles: UserRole[]): boolean =>
    roles.some((r) => user?.roles.includes(r));

  const isSuperAdmin = hasRole("SUPER_ADMIN");
  const isFacilityAdmin = hasRole("FACILITY_ADMIN");
  const isIcuCoordinator = hasRole("ICU_COORDINATOR");
  const isAdmin = isSuperAdmin || isFacilityAdmin;

  const canViewReports = isSuperAdmin;
  const canManageFacilities = isSuperAdmin;
  const canViewAudit = isAdmin;
  const canManageResources = isAdmin;
  const canAssignResources = isSuperAdmin;
  const canAcceptReferral = isSuperAdmin || isFacilityAdmin;
  const canCreateReferral = isSuperAdmin;
  const canManageTransport = isSuperAdmin;
  const canViewResources = isSuperAdmin || isFacilityAdmin || isIcuCoordinator;

  return {
    hasRole,
    isSuperAdmin,
    isFacilityAdmin,
    isIcuCoordinator,
    isAdmin,
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
