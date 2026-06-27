/* eslint-disable react-refresh/only-export-components */
import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { RoleGuard } from "@/components/layout/RoleGuard";
import { RouteError } from "@/components/layout/RouteError";

const NotFoundPage = lazy(() =>
  import("@/pages/NotFoundPage").then((m) => ({ default: m.NotFoundPage }))
);

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
const FacilityProfilePage = lazy(() =>
  import("@/pages/admin/facilities/FacilityProfilePage").then((m) => ({
    default: m.FacilityProfilePage,
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
const AmbulancesPage = lazy(() =>
  import("@/pages/admin/AmbulancesPage").then((m) => ({
    default: m.AmbulancesPage,
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
const NotificationsPage = lazy(() =>
  import("@/pages/notifications/NotificationsPage").then((m) => ({
    default: m.NotificationsPage,
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
const AmbulanceTrackingPage = lazy(() =>
  import("@/pages/transport/AmbulanceTrackingPage").then((m) => ({
    default: m.AmbulanceTrackingPage,
  }))
);

const withSuspense = (element: React.ReactNode) => (
  <Suspense fallback={null}>{element}</Suspense>
);

export const router = createBrowserRouter([
  { path: "/login", element: withSuspense(<LoginPage />), errorElement: <RouteError /> },
  {
    element: <ProtectedRoute />,
    errorElement: <RouteError />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          {
            path: "/dashboard",
            element: (
              <RoleGuard
                roles={["SUPER_ADMIN", "FACILITY_ADMIN"]}
                fallback={<Navigate to="/find-resources" replace />}
              >
                <DashboardPage />
              </RoleGuard>
            ),
          },
          { path: "/profile", element: withSuspense(<ProfilePage />) },
          { path: "/notifications", element: withSuspense(<NotificationsPage />) },
          {
            path: "/resources",
            element: (
              <RoleGuard roles={["CLINICIAN", "FACILITY_ADMIN", "SUPER_ADMIN"]}>
                <ResourcesPage />
              </RoleGuard>
            ),
          },
          {
            path: "/find-resources",
            element: (
              <RoleGuard roles={["CLINICIAN", "FACILITY_ADMIN", "SUPER_ADMIN"]}>
                <FindResourcesPage />
              </RoleGuard>
            ),
          },
          { path: "/transfer-requests", element: withSuspense(<ReferralsPage />) },
          {
            path: "/transfer-requests/new",
            element: (
              <RoleGuard roles={["CLINICIAN", "SUPER_ADMIN"]}>
                <NewReferralPage />
              </RoleGuard>
            ),
          },
          { path: "/transfer-requests/:id", element: withSuspense(<ReferralDetailPage />) },
          {
            path: "/transport/:id/track",
            element: withSuspense(<AmbulanceTrackingPage />),
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
            path: "/facility",
            element: (
              <RoleGuard roles={["FACILITY_ADMIN"]}>
                <FacilityProfilePage />
              </RoleGuard>
            ),
          },
          {
            path: "/admin/units",
            element: (
              <RoleGuard roles={["SUPER_ADMIN"]}>
                <UnitsCatalogPage />
              </RoleGuard>
            ),
          },
          {
            path: "/admin/ambulances",
            element: (
              <RoleGuard roles={["SUPER_ADMIN", "FACILITY_ADMIN"]}>
                <AmbulancesPage />
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
          },
          // Unknown in-app paths render a 404 within the authenticated shell.
          { path: "*", element: withSuspense(<NotFoundPage />) },
        ],
      },
    ],
  },
  // Fallback for anything outside the app shell (e.g. unauthenticated bad paths).
  { path: "*", element: withSuspense(<NotFoundPage />), errorElement: <RouteError /> },
]);
