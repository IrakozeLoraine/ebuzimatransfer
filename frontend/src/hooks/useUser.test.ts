import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { createQueryWrapper } from "@/test/queryWrapper";
import {
  useUser,
  useGetAllUsers,
  useImportUsers,
  useRemoveUserFromFacility,
  useUpdateUser,
  useCreateUser,
  useAssignUser,
  useCreateAndAssignUser,
  useDeactivateUser,
  useUpdateUserAccountStatus,
} from "./useUser";
import * as usersApi from "@/api/users.api";
import { toast } from "@/components/ui/toaster";

vi.mock("@/api/users.api");
vi.mock("@/components/ui/toaster", () => ({ toast: vi.fn() }));
const mocked = vi.mocked(usersApi);
const mockToast = vi.mocked(toast);

beforeEach(() => vi.clearAllMocks());

describe("useUser / useGetAllUsers queries", () => {
  it("does not fetch a user when no id is given", () => {
    const { wrapper } = createQueryWrapper();
    renderHook(() => useUser(undefined), { wrapper });
    expect(mocked.getUser).not.toHaveBeenCalled();
  });

  it("fetches a single user by id", async () => {
    mocked.getUser.mockResolvedValue({ id: "u1" } as never);
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(() => useUser("u1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocked.getUser).toHaveBeenCalledWith("u1");
  });

  it("fetches all users", async () => {
    mocked.getUsers.mockResolvedValue([{ id: "u1" }] as never);
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(() => useGetAllUsers(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocked.getUsers).toHaveBeenCalled();
  });
});

describe("useUser mutations", () => {
  it("importUsers passes the file and optional facility id", async () => {
    mocked.importUsers.mockResolvedValue(undefined as never);
    const { wrapper } = createQueryWrapper();
    const file = new File(["a,b"], "users.csv", { type: "text/csv" });

    const { result } = renderHook(() => useImportUsers("f1"), { wrapper });
    await result.current.mutateAsync(file);

    expect(mocked.importUsers).toHaveBeenCalledWith(file, "f1");
  });

  it("removeUserFromFacility calls back and toasts on success", async () => {
    mocked.removeUserFromFacility.mockResolvedValue(undefined as never);
    const onSuccess = vi.fn();
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(() => useRemoveUserFromFacility({ onSuccess }), { wrapper });
    await result.current.mutateAsync({ userId: "u1", facilityId: "f1" });

    expect(mocked.removeUserFromFacility).toHaveBeenCalledWith("u1", "f1");
    expect(onSuccess).toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: "success" }));
  });

  it("updateUser maps form fields and closes the dialog", async () => {
    mocked.updateUser.mockResolvedValue({ id: "u1" } as never);
    const onClose = vi.fn();
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(() => useUpdateUser({ onClose }), { wrapper });
    await result.current.mutateAsync({
      id: "u1",
      data: { first_name: "Ada", last_name: "Uwase", phone: "07", email: "a@b.rw" } as never,
    });

    expect(mocked.updateUser).toHaveBeenCalledWith("u1", {
      first_name: "Ada",
      last_name: "Uwase",
      phone: "07",
      email: "a@b.rw",
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("createUser maps form fields and closes the dialog", async () => {
    mocked.createUser.mockResolvedValue({ id: "u1" } as never);
    const onClose = vi.fn();
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(() => useCreateUser({ onClose }), { wrapper });
    await result.current.mutateAsync({
      email: "a@b.rw",
      medical_id: "MD1",
      first_name: "Ada",
      last_name: "Uwase",
      phone: "07",
    } as never);

    expect(mocked.createUser).toHaveBeenCalledWith({
      email: "a@b.rw",
      medical_id: "MD1",
      first_name: "Ada",
      last_name: "Uwase",
      phone: "07",
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("createUser surfaces an error toast on failure", async () => {
    mocked.createUser.mockRejectedValue(new Error("boom"));
    const onClose = vi.fn();
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(() => useCreateUser({ onClose }), { wrapper });
    await expect(result.current.mutateAsync({ medical_id: "MD1" } as never)).rejects.toThrow();

    expect(onClose).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }));
  });

  it("createAndAssignUser sends the fixed facility id when provided", async () => {
    mocked.createAndAssignUser.mockResolvedValue({ id: "u1" } as never);
    const onSuccess = vi.fn();
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(
      () => useCreateAndAssignUser({ onSuccess, fixedFacility: { id: "f9", name: "CHUK" } }),
      { wrapper },
    );
    await result.current.mutateAsync({
      medical_id: "MD1",
      first_name: "Ada",
      last_name: "Uwase",
      roles: ["CLINICIAN"],
      unit_ids: [],
    } as never);

    expect(mocked.createAndAssignUser).toHaveBeenCalledWith(expect.objectContaining({ facility_id: "f9" }));
    expect(onSuccess).toHaveBeenCalled();
  });

  it("createAndAssignUser falls back to the facility picked on the form", async () => {
    mocked.createAndAssignUser.mockResolvedValue({ id: "u1" } as never);
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(
      () => useCreateAndAssignUser({ onSuccess: vi.fn(), fixedFacility: null }),
      { wrapper },
    );
    await result.current.mutateAsync({
      medical_id: "MD1",
      first_name: "Ada",
      last_name: "Uwase",
      email: "",
      phone: "",
      facility_id: "f4",
      roles: ["CLINICIAN"],
      unit_ids: [],
    } as never);

    // Blank optional fields are dropped rather than sent as empty strings.
    expect(mocked.createAndAssignUser).toHaveBeenCalledWith(
      expect.objectContaining({ facility_id: "f4", email: undefined, phone: undefined }),
    );
  });

  it("createAndAssignUser toasts when the API rejects", async () => {
    mocked.createAndAssignUser.mockRejectedValue(new Error("nope"));
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(
      () => useCreateAndAssignUser({ onSuccess: vi.fn(), fixedFacility: null }),
      { wrapper },
    );
    await expect(
      result.current.mutateAsync({ medical_id: "MD1", roles: [], unit_ids: [] } as never),
    ).rejects.toThrow();

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })),
    );
  });

  it("deactivateUser deactivates by id and calls back", async () => {
    mocked.deactivateUser.mockResolvedValue(undefined as never);
    const onSuccess = vi.fn();
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(() => useDeactivateUser({ id: "u1", onSuccess }), { wrapper });
    await result.current.mutateAsync();

    expect(mocked.deactivateUser).toHaveBeenCalledWith("u1");
    expect(onSuccess).toHaveBeenCalled();
  });

  it("updateUserAccountStatus forwards the new status", async () => {
    mocked.updateUserAccountStatus.mockResolvedValue(undefined as never);
    const onSuccess = vi.fn();
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(
      () => useUpdateUserAccountStatus({ id: "u1", onSuccess, status: "SUSPENDED" }),
      { wrapper },
    );
    await result.current.mutateAsync();

    expect(mocked.updateUserAccountStatus).toHaveBeenCalledWith("u1", { account_status: "SUSPENDED" });
    expect(onSuccess).toHaveBeenCalled();
  });
});

describe("useAssignUser", () => {
  const cbs = { onSuccess: vi.fn(), onNotFound: vi.fn() };
  const data = { medical_id: "MD1", roles: ["CLINICIAN"], unit_ids: [] };

  it("uses the specific-facility endpoint when a facility is resolved", async () => {
    mocked.assignUserToSpecificFacility.mockResolvedValue(undefined as never);
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(
      () => useAssignUser({ ...cbs, fixedUser: null, fixedFacility: { id: "f2", name: "CHUK" } }),
      { wrapper },
    );
    await result.current.mutateAsync(data as never);

    expect(mocked.assignUserToSpecificFacility).toHaveBeenCalledWith("f2", {
      medical_id: "MD1",
      roles: ["CLINICIAN"],
      unit_ids: [],
    });
    expect(cbs.onSuccess).toHaveBeenCalled();
  });

  it("falls back to the own-facility endpoint when no facility is given", async () => {
    mocked.assignUserToFacility.mockResolvedValue(undefined as never);
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(
      () => useAssignUser({ ...cbs, fixedUser: null, fixedFacility: null }),
      { wrapper },
    );
    await result.current.mutateAsync(data as never);

    expect(mocked.assignUserToFacility).toHaveBeenCalled();
  });

  it("routes a 404 to onNotFound instead of an error toast", async () => {
    const onNotFound = vi.fn();
    // Shape recognised by axios's isAxiosError guard.
    mocked.assignUserToFacility.mockRejectedValue({ isAxiosError: true, response: { status: 404 } });
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(
      () => useAssignUser({ onSuccess: vi.fn(), onNotFound, fixedUser: null, fixedFacility: null }),
      { wrapper },
    );
    await expect(result.current.mutateAsync(data as never)).rejects.toBeDefined();

    expect(onNotFound).toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }));
  });
});
