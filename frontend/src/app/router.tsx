/* eslint-disable react-refresh/only-export-components */
import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { RoleGuard } from "@/components/layout/RoleGuard";
import { AuditLogsPage } from "@/pages/admin/AuditLogsPage";
import { FacilitiesPage } from "@/pages/admin/FacilitiesPage";
import { FacilityDetailPage } from "@/pages/admin/facilities/FacilityDetailPage";
import { ReportsPage } from "@/pages/reports/ReportsPage";
import { UsersPage } from "@/pages/admin/UsersPage";
import { UserDetailPage } from "@/pages/admin/users/UserDetailPage";

const LoginPage = lazy(() =>
  import("@/pages/login/LoginPage").then((m) => ({ default: m.LoginPage }))
);
const DashboardPage = lazy(() =>
  import("@/pages/dashboard/DashboardPage").then((m) => ({
    default: m.DashboardPage,
  }))
);

const withSuspense = (element: React.ReactNode) => (
  <Suspense fallback={null}>{element}</Suspense>
);

export const router = createBrowserRouter([
  { path: "/login", element: withSuspense(<LoginPage />) },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          { path: "/dashboard", element: withSuspense(<DashboardPage />) },
          { path: "/reports",          element: <RoleGuard roles={["SUPER_ADMIN"]}><ReportsPage /></RoleGuard> },
          { path: "/admin/users",      element: <RoleGuard roles={["SUPER_ADMIN","FACILITY_ADMIN"]}><UsersPage /></RoleGuard> },
          { path: "/admin/users/:id",  element: <RoleGuard roles={["SUPER_ADMIN","FACILITY_ADMIN"]}><UserDetailPage /></RoleGuard> },
          { path: "/admin/facilities", element: <RoleGuard roles={["SUPER_ADMIN"]}><FacilitiesPage /></RoleGuard> },
          { path: "/admin/facilities/:id", element: <RoleGuard roles={["SUPER_ADMIN"]}><FacilityDetailPage /></RoleGuard> },
          { path: "/admin/audit",      element: <RoleGuard roles={["SUPER_ADMIN","FACILITY_ADMIN"]}><AuditLogsPage /></RoleGuard> },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/dashboard" replace /> },
]);
