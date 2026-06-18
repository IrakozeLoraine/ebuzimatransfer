/* eslint-disable react-refresh/only-export-components */
import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";

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
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/dashboard" replace /> },
]);
