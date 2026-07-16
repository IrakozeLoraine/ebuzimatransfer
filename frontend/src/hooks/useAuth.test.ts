import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { createQueryWrapper } from "@/test/queryWrapper";
import {
  useCompleteAuth,
  useLogin,
  useSetPassword,
  useLogout,
  useSwitchFacility,
  useUpdateProfile,
  useChangePassword,
  useCurrentUser,
} from "./useAuth";
import { useAuthStore } from "@/store/auth.store";
import * as authApi from "@/api/auth.api";
import type { UserMe } from "@/types/auth";

// react-router's useNavigate needs a Router; mock it so hooks can be exercised
// in isolation while still asserting where they redirect.
const navigate = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", () => ({ useNavigate: () => navigate }));
vi.mock("@/api/auth.api");
vi.mock("@/components/ui/toaster", () => ({ toast: vi.fn() }));

const mocked = vi.mocked(authApi);

const makeUser = (roles: string[], overrides: Partial<UserMe> = {}): UserMe => ({
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
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false });
  localStorage.clear();
});

describe("useCompleteAuth", () => {
  it("stores tokens, loads the user and sends an admin to the dashboard", async () => {
    mocked.getMe.mockResolvedValue(makeUser(["FACILITY_ADMIN"]));
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(() => useCompleteAuth(), { wrapper });
    await result.current("access-1", "refresh-1");

    const state = useAuthStore.getState();
    expect(state.accessToken).toBe("access-1");
    expect(state.isAuthenticated).toBe(true);
    expect(state.user?.roles).toEqual(["FACILITY_ADMIN"]);
    expect(navigate).toHaveBeenCalledWith("/dashboard");
  });

  it("sends a non-admin clinician to find-resources", async () => {
    mocked.getMe.mockResolvedValue(makeUser(["CLINICIAN"]));
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(() => useCompleteAuth(), { wrapper });
    await result.current("access-1", "refresh-1");

    expect(navigate).toHaveBeenCalledWith("/find-resources");
  });
});

describe("useLogin", () => {
  it("calls the login endpoint with the credentials", async () => {
    mocked.login.mockResolvedValue({ access_token: "a", refresh_token: "r" } as never);
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(() => useLogin(), { wrapper });
    await result.current.mutateAsync({ medical_id: "MED-001", password: "pw" });

    expect(mocked.login).toHaveBeenCalledWith({ medical_id: "MED-001", password: "pw" });
  });
});

describe("useSetPassword", () => {
  it("completes auth when the response includes tokens", async () => {
    mocked.setPassword.mockResolvedValue({ access_token: "a", refresh_token: "r" } as never);
    mocked.getMe.mockResolvedValue(makeUser(["CLINICIAN"]));
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(() => useSetPassword(), { wrapper });
    await result.current.mutateAsync({ token: "t", password: "pw" } as never);

    await waitFor(() => expect(useAuthStore.getState().isAuthenticated).toBe(true));
    expect(navigate).toHaveBeenCalledWith("/find-resources");
  });
});

describe("useLogout", () => {
  it("clears the session and redirects to login even after the API settles", async () => {
    mocked.logout.mockResolvedValue(undefined);
    useAuthStore.getState().setTokens("access-1", "refresh-1");
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(() => useLogout(), { wrapper });
    await result.current.mutateAsync();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(navigate).toHaveBeenCalledWith("/login");
  });
});

describe("useSwitchFacility", () => {
  it("swaps tokens, reloads the user and refetches all data", async () => {
    mocked.switchFacility.mockResolvedValue({ access_token: "a2", refresh_token: "r2" } as never);
    mocked.getMe.mockResolvedValue(
      makeUser(["CLINICIAN"], { active_facility_id: "f2", facilities: [{ id: "f2", name: "CHUK" }] as never }),
    );
    const { wrapper, queryClient } = createQueryWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useSwitchFacility(), { wrapper });
    await result.current.mutateAsync("f2");

    expect(mocked.switchFacility).toHaveBeenCalledWith("f2");
    expect(useAuthStore.getState().accessToken).toBe("a2");
    expect(invalidate).toHaveBeenCalledWith();
  });

  it("surfaces a toast when switching facility fails", async () => {
    mocked.switchFacility.mockRejectedValue(new Error("nope"));
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(() => useSwitchFacility(), { wrapper });
    await expect(result.current.mutateAsync("f2")).rejects.toThrow();
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useUpdateProfile", () => {
  it("persists the updated user in the store", async () => {
    const updated = makeUser(["CLINICIAN"], { first_name: "Grace" });
    mocked.updateProfile.mockResolvedValue(updated);
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(() => useUpdateProfile(), { wrapper });
    await result.current.mutateAsync({ first_name: "Grace" } as never);

    expect(useAuthStore.getState().user?.first_name).toBe("Grace");
  });

  it("reports an error toast when the update fails", async () => {
    mocked.updateProfile.mockRejectedValue(new Error("nope"));
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(() => useUpdateProfile(), { wrapper });
    await expect(result.current.mutateAsync({ first_name: "Grace" } as never)).rejects.toThrow();
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useChangePassword", () => {
  it("forwards the current and new passwords", async () => {
    mocked.changePassword.mockResolvedValue(undefined);
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(() => useChangePassword(), { wrapper });
    await result.current.mutateAsync({ currentPassword: "old", newPassword: "new" });

    expect(mocked.changePassword).toHaveBeenCalledWith("old", "new");
  });

  it("reports an error toast when the change fails", async () => {
    mocked.changePassword.mockRejectedValue(new Error("nope"));
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(() => useChangePassword(), { wrapper });
    await expect(
      result.current.mutateAsync({ currentPassword: "old", newPassword: "new" }),
    ).rejects.toThrow();
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useCurrentUser", () => {
  it("does not fetch when unauthenticated", () => {
    const { wrapper } = createQueryWrapper();

    renderHook(() => useCurrentUser(), { wrapper });

    expect(mocked.getMe).not.toHaveBeenCalled();
  });

  it("fetches and stores the user when authenticated", async () => {
    useAuthStore.getState().setTokens("access-1", "refresh-1");
    mocked.getMe.mockResolvedValue(makeUser(["CLINICIAN"]));
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(() => useCurrentUser(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(useAuthStore.getState().user?.roles).toEqual(["CLINICIAN"]);
  });
});
