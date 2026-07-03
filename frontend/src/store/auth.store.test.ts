import { describe, it, expect, beforeEach } from "vitest";
import { useAuthStore } from "./auth.store";
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
  roles,
  active_facility_id: null,
  facilities: [],
  facility_roles: [],
  account_status: "ACTIVE",
});

const reset = () =>
  useAuthStore.setState({
    user: null,
    accessToken: null,
    refreshToken: null,
    isAuthenticated: false,
  });

describe("auth.store", () => {
  beforeEach(() => {
    reset();
    localStorage.clear();
  });

  it("setTokens marks the session authenticated and persists tokens", () => {
    useAuthStore.getState().setTokens("access-1", "refresh-1");
    const state = useAuthStore.getState();
    expect(state.accessToken).toBe("access-1");
    expect(state.refreshToken).toBe("refresh-1");
    expect(state.isAuthenticated).toBe(true);
    expect(localStorage.getItem("access_token")).toBe("access-1");
    expect(localStorage.getItem("refresh_token")).toBe("refresh-1");
  });

  it("logout clears user, tokens and localStorage", () => {
    useAuthStore.getState().setTokens("access-1", "refresh-1");
    useAuthStore.getState().setUser(makeUser(["CLINICIAN"]));

    useAuthStore.getState().logout();

    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.accessToken).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(localStorage.getItem("access_token")).toBeNull();
    expect(localStorage.getItem("refresh_token")).toBeNull();
  });

  it("hasRole reflects the current user's roles", () => {
    useAuthStore.getState().setUser(makeUser(["CLINICIAN", "FACILITY_ADMIN"]));
    expect(useAuthStore.getState().hasRole("CLINICIAN")).toBe(true);
    expect(useAuthStore.getState().hasRole("SUPER_ADMIN")).toBe(false);
  });

  it("hasRole returns false when there is no user", () => {
    expect(useAuthStore.getState().hasRole("CLINICIAN")).toBe(false);
  });
});
