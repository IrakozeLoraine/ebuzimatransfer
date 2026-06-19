import { useAuthStore } from "@/store/auth.store";
import type { UserRole } from "@/types/auth";

export const usePermissions = () => {
  const user = useAuthStore((s) => s.user);

  const hasRole = (...roles: UserRole[]): boolean =>
    roles.some((r) => user?.roles.includes(r));

  const isSuperAdmin = hasRole("SUPER_ADMIN");

  const canViewReports = isSuperAdmin;
  const canManageFacilities = isSuperAdmin;
  const canViewAudit = isSuperAdmin;

  return {
    hasRole,
    isSuperAdmin,
    canViewReports,
    canManageFacilities,
    canViewAudit,
  };
};
