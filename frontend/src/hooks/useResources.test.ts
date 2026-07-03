import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { createQueryWrapper } from "@/test/queryWrapper";
import {
  useResources,
  useCapacity,
  useCreateResource,
  useUpdateResourceCounts,
  useAssignResources,
  useAddResourceUnits,
  useRemoveResourceUnits,
  useImportResources,
  useResourceUsage,
  useAvailableResources,
  useReserveResource,
} from "./useResources";
import * as resourcesApi from "@/api/resources.api";
import * as reportsApi from "@/api/reports.api";

vi.mock("@/api/resources.api");
vi.mock("@/api/reports.api");
const mocked = vi.mocked(resourcesApi);
const reportsMocked = vi.mocked(reportsApi);

beforeEach(() => vi.clearAllMocks());

describe("useResources queries", () => {
  it("fetches resources with filters", async () => {
    mocked.getResources.mockResolvedValue([{ id: "r1" }] as never);
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(() => useResources({ unit_id: "u1" } as never), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocked.getResources).toHaveBeenCalledWith({ unit_id: "u1" });
  });

  it("fetches capacity", async () => {
    reportsMocked.getCapacity.mockResolvedValue({ total: 10 } as never);
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(() => useCapacity(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(reportsMocked.getCapacity).toHaveBeenCalled();
  });

  it("does not fetch usage when the id is null", () => {
    const { wrapper } = createQueryWrapper();
    renderHook(() => useResourceUsage(null), { wrapper });
    expect(mocked.getResourceUsage).not.toHaveBeenCalled();
  });

  it("fetches usage for a given id", async () => {
    mocked.getResourceUsage.mockResolvedValue({ used: 3 } as never);
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(() => useResourceUsage("r1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocked.getResourceUsage).toHaveBeenCalledWith("r1");
  });

  it("fetches available resources, passing undefined when no unit is given", async () => {
    mocked.getAvailableResources.mockResolvedValue([] as never);
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(() => useAvailableResources(null), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocked.getAvailableResources).toHaveBeenCalledWith(undefined);
  });
});

describe("useResources mutations", () => {
  // Every mutation invalidates the same set of resource-related caches.
  const expectResourceInvalidations = (invalidate: ReturnType<typeof vi.spyOn>) => {
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["resources"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["resources-available"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["capacity"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["dashboard-activity"] });
  };

  it("createResource creates and invalidates resource data", async () => {
    mocked.createResource.mockResolvedValue({ id: "r1" } as never);
    const { wrapper, queryClient } = createQueryWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCreateResource(), { wrapper });
    await result.current.mutateAsync({ resource_name: "Ventilator" } as never);

    expect(mocked.createResource).toHaveBeenCalledWith({ resource_name: "Ventilator" });
    expectResourceInvalidations(invalidate);
  });

  it("updateResourceCounts forwards the id and counts", async () => {
    mocked.updateResourceCounts.mockResolvedValue({ id: "r1" } as never);
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(() => useUpdateResourceCounts(), { wrapper });
    await result.current.mutateAsync({ id: "r1", counts: { available: 2 } as never });

    expect(mocked.updateResourceCounts).toHaveBeenCalledWith("r1", { available: 2 });
  });

  it("assignResources forwards the payload", async () => {
    mocked.assignResources.mockResolvedValue(undefined as never);
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(() => useAssignResources(), { wrapper });
    await result.current.mutateAsync({ unit_id: "u1", resource_ids: ["r1"] } as never);

    expect(mocked.assignResources).toHaveBeenCalledWith({ unit_id: "u1", resource_ids: ["r1"] });
  });

  it("addResourceUnits and removeResourceUnits forward id and count", async () => {
    mocked.addResourceUnits.mockResolvedValue(undefined as never);
    mocked.removeResourceUnits.mockResolvedValue(undefined as never);
    const { wrapper } = createQueryWrapper();

    const add = renderHook(() => useAddResourceUnits(), { wrapper });
    await add.result.current.mutateAsync({ id: "r1", count: 3 });
    expect(mocked.addResourceUnits).toHaveBeenCalledWith("r1", 3);

    const remove = renderHook(() => useRemoveResourceUnits(), { wrapper });
    await remove.result.current.mutateAsync({ id: "r1", count: 1 });
    expect(mocked.removeResourceUnits).toHaveBeenCalledWith("r1", 1);
  });

  it("importResources uploads the file", async () => {
    mocked.importResources.mockResolvedValue(undefined as never);
    const { wrapper } = createQueryWrapper();
    const file = new File(["a,b"], "resources.csv", { type: "text/csv" });

    const { result } = renderHook(() => useImportResources(), { wrapper });
    await result.current.mutateAsync(file);

    expect(mocked.importResources).toHaveBeenCalledWith(file);
  });

  it("reserveResource forwards the id and planned admission time", async () => {
    mocked.reserveResource.mockResolvedValue(undefined as never);
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(() => useReserveResource(), { wrapper });
    await result.current.mutateAsync({ id: "r1", plannedAdmissionTime: "2026-01-01T10:00:00Z" });

    expect(mocked.reserveResource).toHaveBeenCalledWith("r1", "2026-01-01T10:00:00Z");
  });
});
