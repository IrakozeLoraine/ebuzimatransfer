import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { RoleGuard } from "./RoleGuard";
import { useAuthStore } from "@/store/auth.store";
import type { UserMe, UserRole } from "@/types/auth";

const makeUser = (roles: string[]): UserMe => ({
  id: "u1",
  email: "a@b.rw",
  medical_id: "MD1",
  first_name: "Ada",
  last_name: "Uwase",
  phone: null,
  location: null,
  unit_ids: [],
  active_unit_id: null,
  roles,
  active_facility_id: null,
  facilities: [],
  facility_roles: [],
  account_status: "ACTIVE",
});

const setRoles = (roles: string[] | null) =>
  useAuthStore.setState({ user: roles ? makeUser(roles) : null });

const renderGuard = (allowed: UserRole[], fallback?: React.ReactNode) =>
  render(
    <MemoryRouter initialEntries={["/protected"]}>
      <Routes>
        <Route
          path="/protected"
          element={
            <RoleGuard roles={allowed} fallback={fallback}>
              <div>Secret content</div>
            </RoleGuard>
          }
        />
        <Route path="/dashboard" element={<div>Dashboard</div>} />
      </Routes>
    </MemoryRouter>
  );

describe("RoleGuard", () => {
  beforeEach(() => setRoles(null));

  it("renders children when the user holds an allowed role", () => {
    setRoles(["SUPER_ADMIN"]);
    renderGuard(["SUPER_ADMIN"]);
    expect(screen.getByText("Secret content")).toBeInTheDocument();
  });

  it("redirects to the dashboard when the role is missing", () => {
    setRoles(["CLINICIAN"]);
    renderGuard(["SUPER_ADMIN"]);
    expect(screen.queryByText("Secret content")).not.toBeInTheDocument();
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  it("renders the provided fallback instead of redirecting", () => {
    setRoles(["CLINICIAN"]);
    renderGuard(["SUPER_ADMIN"], <div>Access denied</div>);
    expect(screen.getByText("Access denied")).toBeInTheDocument();
    expect(screen.queryByText("Secret content")).not.toBeInTheDocument();
  });
});
