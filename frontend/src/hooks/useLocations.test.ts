import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { createQueryWrapper } from "@/test/queryWrapper";
import { useProvinces, useDistricts, useSectors, useCells, useVillages } from "./useLocations";
import * as locationsApi from "@/api/locations.api";

vi.mock("@/api/locations.api");
const mocked = vi.mocked(locationsApi);

beforeEach(() => vi.clearAllMocks());

describe("useLocations cascading queries", () => {
  it("always fetches provinces", async () => {
    mocked.getProvinces.mockResolvedValue(["Kigali"] as never);
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(() => useProvinces(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocked.getProvinces).toHaveBeenCalled();
  });

  it("only fetches districts once a province is chosen", async () => {
    mocked.getDistricts.mockResolvedValue(["Nyarugenge"] as never);
    const { wrapper } = createQueryWrapper();

    const { rerender } = renderHook(({ p }: { p: string | null }) => useDistricts(p), {
      wrapper,
      initialProps: { p: null as string | null },
    });
    expect(mocked.getDistricts).not.toHaveBeenCalled();

    rerender({ p: "Kigali" });
    await waitFor(() => expect(mocked.getDistricts).toHaveBeenCalledWith("Kigali"));
  });

  it("only fetches sectors once both province and district are set", async () => {
    mocked.getSectors.mockResolvedValue([] as never);
    const { wrapper } = createQueryWrapper();

    renderHook(() => useSectors("Kigali", null), { wrapper });
    expect(mocked.getSectors).not.toHaveBeenCalled();

    renderHook(() => useSectors("Kigali", "Nyarugenge"), { wrapper });
    await waitFor(() => expect(mocked.getSectors).toHaveBeenCalledWith("Kigali", "Nyarugenge"));
  });

  it("only fetches cells once province, district and sector are set", async () => {
    mocked.getCells.mockResolvedValue([] as never);
    const { wrapper } = createQueryWrapper();

    renderHook(() => useCells("Kigali", "Nyarugenge", null), { wrapper });
    expect(mocked.getCells).not.toHaveBeenCalled();

    renderHook(() => useCells("Kigali", "Nyarugenge", "Nyamirambo"), { wrapper });
    await waitFor(() => expect(mocked.getCells).toHaveBeenCalledWith("Kigali", "Nyarugenge", "Nyamirambo"));
  });

  it("only fetches villages once the full chain is set", async () => {
    mocked.getVillages.mockResolvedValue([] as never);
    const { wrapper } = createQueryWrapper();

    renderHook(() => useVillages("Kigali", "Nyarugenge", "Nyamirambo", null), { wrapper });
    expect(mocked.getVillages).not.toHaveBeenCalled();

    renderHook(() => useVillages("Kigali", "Nyarugenge", "Nyamirambo", "Cyivugiza"), { wrapper });
    await waitFor(() =>
      expect(mocked.getVillages).toHaveBeenCalledWith("Kigali", "Nyarugenge", "Nyamirambo", "Cyivugiza"),
    );
  });
});
