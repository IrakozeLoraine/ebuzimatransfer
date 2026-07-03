import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { createQueryWrapper } from "@/test/queryWrapper";
import { useUnits, useGetAllUnits, useCreateUnit, useUpdateUnit, useDeleteUnit, useImportUnits } from "./useUnits";
import * as unitsApi from "@/api/units.api";

vi.mock("@/api/units.api");
const mocked = vi.mocked(unitsApi);

beforeEach(() => vi.clearAllMocks());

describe("useUnits", () => {
  it("fetches units with the given params", async () => {
    mocked.getUnits.mockResolvedValue([{ id: "u1" }] as never);
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(() => useUnits({ facility_id: "f1" } as never), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocked.getUnits).toHaveBeenCalledWith({ facility_id: "f1" });
  });

  it("does not fetch when disabled", () => {
    const { wrapper } = createQueryWrapper();
    renderHook(() => useGetAllUnits({ enabled: false }), { wrapper });
    expect(mocked.getUnits).not.toHaveBeenCalled();
  });
});

describe("useUnits mutations", () => {
  it("createUnit invalidates the units list", async () => {
    mocked.createUnit.mockResolvedValue({ id: "u1" } as never);
    const { wrapper, queryClient } = createQueryWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCreateUnit(), { wrapper });
    await result.current.mutateAsync({ name: "ICU" } as never);

    expect(mocked.createUnit).toHaveBeenCalledWith({ name: "ICU" });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["units"] });
  });

  it("updateUnit forwards the id and payload", async () => {
    mocked.updateUnit.mockResolvedValue({ id: "u1" } as never);
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(() => useUpdateUnit(), { wrapper });
    await result.current.mutateAsync({ id: "u1", payload: { name: "HDU" } as never });

    expect(mocked.updateUnit).toHaveBeenCalledWith("u1", { name: "HDU" });
  });

  it("deleteUnit removes by id", async () => {
    mocked.deleteUnit.mockResolvedValue(undefined as never);
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(() => useDeleteUnit(), { wrapper });
    await result.current.mutateAsync("u1");

    expect(mocked.deleteUnit).toHaveBeenCalledWith("u1");
  });

  it("importUnits uploads the file", async () => {
    mocked.importUnits.mockResolvedValue(undefined as never);
    const { wrapper } = createQueryWrapper();
    const file = new File(["a,b"], "units.csv", { type: "text/csv" });

    const { result } = renderHook(() => useImportUnits(), { wrapper });
    await result.current.mutateAsync(file);

    expect(mocked.importUnits).toHaveBeenCalledWith(file);
  });
});
