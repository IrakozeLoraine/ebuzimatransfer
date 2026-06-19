import { Navigate } from "react-router-dom";
import { usePermissions } from "@/hooks/usePermissions";
import type { UserRole } from "@/types/auth";

interface Props {
  roles: UserRole[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export const RoleGuard = ({ roles, children, fallback }: Props) => {
  const { hasRole } = usePermissions();
  if (!hasRole(...roles)) {
    return fallback ? <>{fallback}</> : <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
};
