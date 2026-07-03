import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { createQueryWrapper } from "@/test/queryWrapper";
import {
  useFacilities,
  useFacility,
  useFacilityUsers,
  useCreateFacility,
  useUpdateFacility,
  useSetFacilityLocation,
  useReactivateFacility,
  useImportFacilities,
  useDeleteFacility,
} from "./useFacilities";
import * as facilitiesApi from "@/api/facilities.api";
import { toast } from "@/components/ui/toaster";

vi.mock("@/api/facilities.api");
vi.mock("@/components/ui/toaster", () => ({ toast: vi.fn() }));
const mocked = vi.mocked(facilitiesApi);
const mockToast = vi.mocked(toast);

beforeEach(() => vi.clearAllMocks());

describe("useFacilities queries", () => {
  it("fetches the facility list", async () => {
    mocked.getFacilities.mockResolvedValue([{ id: "f1" }] as never);
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(() => useFacilities(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocked.getFacilities).toHaveBeenCalled();
  });

  it("does not fetch a single facility without an id", () => {
    const { wrapper } = createQueryWrapper();
    renderHook(() => useFacility(undefined), { wrapper });
    expect(mocked.getFacility).not.toHaveBeenCalled();
  });

  it("fetches a facility and its users by id", async () => {
    mocked.getFacility.mockResolvedValue({ id: "f1" } as never);
    mocked.getFacilityUsers.mockResolvedValue([] as never);
    const { wrapper } = createQueryWrapper();

    renderHook(() => useFacility("f1"), { wrapper });
    renderHook(() => useFacilityUsers("f1"), { wrapper });

    await waitFor(() => expect(mocked.getFacility).toHaveBeenCalledWith("f1"));
    await waitFor(() => expect(mocked.getFacilityUsers).toHaveBeenCalledWith("f1"));
  });
});

describe("useFacilities mutations", () => {
  it("createFacility invalidates the list and toasts success", async () => {
    mocked.createFacility.mockResolvedValue({ id: "f1" } as never);
    const { wrapper, queryClient } = createQueryWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCreateFacility(), { wrapper });
    await result.current.mutateAsync({ name: "CHUK" });

    expect(mocked.createFacility).toHaveBeenCalledWith({ name: "CHUK" });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["facilities"] });
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: "success" }));
  });

  it("createFacility toasts a destructive message on failure", async () => {
    mocked.createFacility.mockRejectedValue(new Error("boom"));
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(() => useCreateFacility(), { wrapper });
    await expect(result.current.mutateAsync({ name: "CHUK" })).rejects.toThrow();

    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }));
  });

  it("updateFacility forwards the id and payload", async () => {
    mocked.updateFacility.mockResolvedValue({ id: "f1" } as never);
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(() => useUpdateFacility(), { wrapper });
    await result.current.mutateAsync({ id: "f1", payload: { name: "New" } });

    expect(mocked.updateFacility).toHaveBeenCalledWith("f1", { name: "New" });
  });

  it("setFacilityLocation saves coordinates and invalidates the facility", async () => {
    mocked.setFacilityLocation.mockResolvedValue({ id: "f1" } as never);
    const { wrapper, queryClient } = createQueryWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useSetFacilityLocation(), { wrapper });
    await result.current.mutateAsync({ id: "f1", latitude: -1.9, longitude: 30.1 });

    expect(mocked.setFacilityLocation).toHaveBeenCalledWith("f1", { latitude: -1.9, longitude: 30.1 });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["facility", "f1"] });
  });

  it("reactivateFacility reactivates by id", async () => {
    mocked.reactivateFacility.mockResolvedValue({ id: "f1" } as never);
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(() => useReactivateFacility(), { wrapper });
    await result.current.mutateAsync("f1");

    expect(mocked.reactivateFacility).toHaveBeenCalledWith("f1");
  });

  it("importFacilities uploads the file", async () => {
    mocked.importFacilities.mockResolvedValue(undefined as never);
    const { wrapper } = createQueryWrapper();
    const file = new File(["a,b"], "facilities.csv", { type: "text/csv" });

    const { result } = renderHook(() => useImportFacilities(), { wrapper });
    await result.current.mutateAsync(file);

    expect(mocked.importFacilities).toHaveBeenCalledWith(file);
  });

  it("deleteFacility deactivates by id and toasts success", async () => {
    mocked.deleteFacility.mockResolvedValue(undefined as never);
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(() => useDeleteFacility(), { wrapper });
    await result.current.mutateAsync("f1");

    expect(mocked.deleteFacility).toHaveBeenCalledWith("f1");
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: "success" }));
  });
});
