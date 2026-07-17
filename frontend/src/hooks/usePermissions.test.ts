import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { usePermissions } from "./usePermissions";
import { useAuthStore } from "@/store/auth.store";
import type { UserMe } from "@/types/auth";

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

describe("usePermissions", () => {
  beforeEach(() => setRoles(null));

  it("grants SUPER_ADMIN the facility-management capabilities", () => {
    setRoles(["SUPER_ADMIN"]);
    const { result } = renderHook(() => usePermissions());
    expect(result.current.isSuperAdmin).toBe(true);
    expect(result.current.isAdmin).toBe(true);
    expect(result.current.canManageFacilities).toBe(true);
    expect(result.current.canViewAudit).toBe(true);
  });

  it("does not let a FACILITY_ADMIN manage facilities", () => {
    setRoles(["FACILITY_ADMIN"]);
    const { result } = renderHook(() => usePermissions());
    expect(result.current.isFacilityAdmin).toBe(true);
    expect(result.current.isAdmin).toBe(true);
    expect(result.current.canManageFacilities).toBe(false);
    expect(result.current.canViewAudit).toBe(true);
  });

  it("lets a CLINICIAN create and accept referrals but not view audit", () => {
    setRoles(["CLINICIAN"]);
    const { result } = renderHook(() => usePermissions());
    expect(result.current.isClinician).toBe(true);
    expect(result.current.canCreateReferral).toBe(true);
    expect(result.current.canAcceptReferral).toBe(true);
    expect(result.current.canManageTransport).toBe(true);
    expect(result.current.canViewAudit).toBe(false);
    expect(result.current.canManageResources).toBe(false);
  });

  it("hasRole accepts multiple roles (any-match)", () => {
    setRoles(["CLINICIAN"]);
    const { result } = renderHook(() => usePermissions());
    expect(result.current.hasRole("SUPER_ADMIN", "CLINICIAN")).toBe(true);
    expect(result.current.hasRole("SUPER_ADMIN", "FACILITY_ADMIN")).toBe(false);
  });

  it("grants nothing when unauthenticated", () => {
    const { result } = renderHook(() => usePermissions());
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.canCreateReferral).toBe(false);
    expect(result.current.canViewResources).toBe(false);
  });
});
