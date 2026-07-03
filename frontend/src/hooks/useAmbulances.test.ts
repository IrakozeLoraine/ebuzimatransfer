import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { createQueryWrapper } from "@/test/queryWrapper";
import { useAmbulances, useCreateAmbulance, useUpdateAmbulance, useResetAmbulancePassword } from "./useAmbulances";
import * as ambulanceApi from "@/api/ambulance.api";

vi.mock("@/api/ambulance.api");
const mocked = vi.mocked(ambulanceApi);

beforeEach(() => vi.clearAllMocks());

describe("useAmbulances", () => {
  it("lists all ambulances by default", async () => {
    mocked.listAmbulances.mockResolvedValue([{ id: "a1" }] as never);
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(() => useAmbulances(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocked.listAmbulances).toHaveBeenCalledWith(false);
  });

  it("lists only available ambulances when requested", async () => {
    mocked.listAmbulances.mockResolvedValue([] as never);
    const { wrapper } = createQueryWrapper();

    renderHook(() => useAmbulances(true), { wrapper });

    await waitFor(() => expect(mocked.listAmbulances).toHaveBeenCalledWith(true));
  });
});

describe("useAmbulances mutations", () => {
  it("createAmbulance invalidates the list", async () => {
    mocked.createAmbulance.mockResolvedValue({ id: "a1" } as never);
    const { wrapper, queryClient } = createQueryWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCreateAmbulance(), { wrapper });
    await result.current.mutateAsync({ plate: "RAB123" } as never);

    expect(mocked.createAmbulance).toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["ambulances"] });
  });

  it("updateAmbulance forwards the id and payload", async () => {
    mocked.updateAmbulance.mockResolvedValue({ id: "a1" } as never);
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(() => useUpdateAmbulance(), { wrapper });
    await result.current.mutateAsync({ id: "a1", payload: { plate: "RAB999" } as never });

    expect(mocked.updateAmbulance).toHaveBeenCalledWith("a1", { plate: "RAB999" });
  });

  it("resetAmbulancePassword resets by id", async () => {
    mocked.resetAmbulancePassword.mockResolvedValue({ password: "x" } as never);
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(() => useResetAmbulancePassword(), { wrapper });
    await result.current.mutateAsync("a1");

    expect(mocked.resetAmbulancePassword).toHaveBeenCalledWith("a1");
  });
});
