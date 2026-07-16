import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { createQueryWrapper } from "@/test/queryWrapper";
import { useInAppCalls, useInAppCallsLog } from "./useInAppCalls";
import * as incallApi from "@/api/incall.api";

vi.mock("@/api/incall.api");
const mocked = vi.mocked(incallApi);

beforeEach(() => {
  vi.clearAllMocks();
  mocked.getInAppCalls.mockResolvedValue([]);
  mocked.getInAppCallsLog.mockResolvedValue([]);
});

describe("useInAppCalls", () => {
  it("fetches calls for a specific referral", async () => {
    const { wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useInAppCalls("ref-1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocked.getInAppCalls).toHaveBeenCalledWith("ref-1");
  });

  it("fetches the caller's own calls when no referral is given", async () => {
    const { wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useInAppCalls(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocked.getInAppCalls).toHaveBeenCalledWith(undefined);
  });
});

describe("useInAppCallsLog", () => {
  it("fetches the call log filtered by status", async () => {
    const { wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useInAppCallsLog("missed"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocked.getInAppCallsLog).toHaveBeenCalledWith("missed");
  });

  it("fetches the whole call log when no status is given", async () => {
    const { wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useInAppCallsLog(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocked.getInAppCallsLog).toHaveBeenCalledWith(undefined);
  });
});
