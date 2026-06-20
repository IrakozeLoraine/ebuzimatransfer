import { useAuthStore } from "@/store/auth.store";
import type { UserRole } from "@/types/auth";

export const usePermissions = () => {
  const user = useAuthStore((s) => s.user);

  const hasRole = (...roles: UserRole[]): boolean =>
    roles.some((r) => user?.roles.includes(r));

  const isSuperAdmin = hasRole("SUPER_ADMIN");
  const isFacilityAdmin = hasRole("FACILITY_ADMIN");
  const isAdmin = isSuperAdmin || isFacilityAdmin;

  const canViewReports = isSuperAdmin;
  const canManageFacilities = isSuperAdmin;
  const canViewAudit = isAdmin;
  const canManageResources = isSuperAdmin;
  const canAcceptReferral = isSuperAdmin || isFacilityAdmin;
  const canCreateReferral = isSuperAdmin;
  const canManageTransport = isSuperAdmin;

  return {
    hasRole,
    isSuperAdmin,
    isFacilityAdmin,
    isAdmin,
    canViewReports,
    canManageFacilities,
    canViewAudit,
    canManageResources,
    canAcceptReferral,
    canCreateReferral,
    canManageTransport,
  };
};
