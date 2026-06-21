/* eslint-disable react-refresh/only-export-components */
import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { RoleGuard } from "@/components/layout/RoleGuard";

const LoginPage = lazy(() =>
  import("@/pages/login/LoginPage").then((m) => ({ default: m.LoginPage }))
);
const DashboardPage = lazy(() =>
  import("@/pages/dashboard/DashboardPage").then((m) => ({
    default: m.DashboardPage,
  }))
);
const ResourcesPage = lazy(() =>
  import("@/pages/capacity/ResourcesPage").then((m) => ({
    default: m.ResourcesPage,
  }))
);
const ReportsPage = lazy(() =>
  import("@/pages/reports/ReportsPage").then((m) => ({
    default: m.ReportsPage,
  }))
);
const UsersPage = lazy(() =>
  import("@/pages/admin/UsersPage").then((m) => ({
    default: m.UsersPage,
  }))
);
const UserDetailPage = lazy(() =>
  import("@/pages/admin/users/UserDetailPage").then((m) => ({
    default: m.UserDetailPage,
  }))
);
const FacilitiesPage = lazy(() =>
  import("@/pages/admin/FacilitiesPage").then((m) => ({
    default: m.FacilitiesPage,
  }))
);
const FacilityDetailPage = lazy(() =>
  import("@/pages/admin/facilities/FacilityDetailPage").then((m) => ({
    default: m.FacilityDetailPage,
  }))
);
const AuditLogsPage = lazy(() =>
  import("@/pages/admin/AuditLogsPage").then((m) => ({
    default: m.AuditLogsPage,
  }))
);
const UnitsCatalogPage = lazy(() =>
  import("@/pages/admin/units/UnitsCatalogPage").then((m) => ({
    default: m.UnitsCatalogPage,
  }))
);
const FindResourcesPage = lazy(() =>
  import("@/pages/transfers/FindResourcesPage").then((m) => ({
    default: m.FindResourcesPage,
  }))
);
const ProfilePage = lazy(() =>
  import("@/pages/profile/ProfilePage").then((m) => ({
    default: m.ProfilePage,
  }))
);

const ReferralsPage = lazy(() =>
  import("@/pages/referrals/ReferralsPage").then((m) => ({
    default: m.ReferralsPage,
  }))
);
const NewReferralPage = lazy(() =>
  import("@/pages/referrals/NewReferralPage").then((m) => ({
    default: m.NewReferralPage,
  }))
);
const ReferralDetailPage = lazy(() =>
  import("@/pages/referrals/ReferralDetailPage").then((m) => ({
    default: m.ReferralDetailPage,
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
          { path: "/profile", element: withSuspense(<ProfilePage />) },
          {
            path: "/resources",
            element: (
              <RoleGuard roles={["ICU_COORDINATOR", "FACILITY_ADMIN", "SUPER_ADMIN"]}>
                <ResourcesPage />
              </RoleGuard>
            ),
          },
          {
            path: "/find-resources",
            element: (
              <RoleGuard roles={["ICU_COORDINATOR", "FACILITY_ADMIN", "SUPER_ADMIN"]}>
                <FindResourcesPage />
              </RoleGuard>
            ),
          },
          { path: "/referrals", element: withSuspense(<ReferralsPage />) },
          {
            path: "/referrals/new",
            element: (
              <RoleGuard roles={["REFERRING_CLINICIAN", "SUPER_ADMIN"]}>
                <NewReferralPage />
              </RoleGuard>
            ),
          },
          { path: "/referrals/:id", element: withSuspense(<ReferralDetailPage />) },
          {
            path: "/reports",
            element: (
              <RoleGuard roles={["SUPER_ADMIN"]}>
                <ReportsPage />
              </RoleGuard>
            ),
          },
          {
            path: "/admin/users",
            element: (
              <RoleGuard roles={["SUPER_ADMIN", "FACILITY_ADMIN"]}>
                <UsersPage />
              </RoleGuard>
            ),
          },
          { path: "/admin/users/:id", element: <RoleGuard roles={["SUPER_ADMIN", "FACILITY_ADMIN"]}><UserDetailPage /></RoleGuard> },
          {
            path: "/admin/facilities",
            element: (
              <RoleGuard roles={["SUPER_ADMIN"]}>
                <FacilitiesPage />
              </RoleGuard>
            ),
          },
          { path: "/admin/facilities/:id", element: <RoleGuard roles={["SUPER_ADMIN"]}><FacilityDetailPage /></RoleGuard> },
          {
            path: "/admin/units",
            element: (
              <RoleGuard roles={["SUPER_ADMIN"]}>
                <UnitsCatalogPage />
              </RoleGuard>
            ),
          },
          {
            path: "/admin/audit",
            element: (
              <RoleGuard roles={["SUPER_ADMIN", "FACILITY_ADMIN"]}>
                <AuditLogsPage />
              </RoleGuard>
            ),
          }
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/dashboard" replace /> },
]);
