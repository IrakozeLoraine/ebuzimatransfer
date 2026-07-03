import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { createQueryWrapper } from "@/test/queryWrapper";
import {
  usePhoneLines,
  useCreatePhoneLine,
  useDeletePhoneLine,
  useImportPhoneLines,
  useCalls,
  useLogCall,
} from "./useCalls";
import * as callsApi from "@/api/calls.api";

vi.mock("@/api/calls.api");
const mocked = vi.mocked(callsApi);

beforeEach(() => vi.clearAllMocks());

describe("usePhoneLines / useCalls queries", () => {
  it("does not fetch phone lines without a facility id", () => {
    const { wrapper } = createQueryWrapper();
    renderHook(() => usePhoneLines(undefined), { wrapper });
    expect(mocked.getPhoneLines).not.toHaveBeenCalled();
  });

  it("fetches phone lines for a facility (active only by default)", async () => {
    mocked.getPhoneLines.mockResolvedValue([] as never);
    const { wrapper } = createQueryWrapper();

    renderHook(() => usePhoneLines("f1"), { wrapper });

    await waitFor(() => expect(mocked.getPhoneLines).toHaveBeenCalledWith("f1", true));
  });

  it("does not fetch calls without a referral id", () => {
    const { wrapper } = createQueryWrapper();
    renderHook(() => useCalls(undefined), { wrapper });
    expect(mocked.getCalls).not.toHaveBeenCalled();
  });

  it("fetches calls for a referral", async () => {
    mocked.getCalls.mockResolvedValue([] as never);
    const { wrapper } = createQueryWrapper();

    renderHook(() => useCalls("r1"), { wrapper });

    await waitFor(() => expect(mocked.getCalls).toHaveBeenCalledWith("r1"));
  });
});

describe("useCalls mutations", () => {
  it("createPhoneLine invalidates that facility's lines", async () => {
    mocked.createPhoneLine.mockResolvedValue({ id: "p1" } as never);
    const { wrapper, queryClient } = createQueryWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCreatePhoneLine("f1"), { wrapper });
    await result.current.mutateAsync({ label: "ICU desk" } as never);

    expect(mocked.createPhoneLine).toHaveBeenCalledWith("f1", { label: "ICU desk" });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["phone-lines", "f1"] });
  });

  it("deletePhoneLine removes by id", async () => {
    mocked.deletePhoneLine.mockResolvedValue(undefined as never);
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(() => useDeletePhoneLine("f1"), { wrapper });
    await result.current.mutateAsync("p1");

    expect(mocked.deletePhoneLine).toHaveBeenCalledWith("p1");
  });

  it("importPhoneLines uploads the file for the facility", async () => {
    mocked.importPhoneLines.mockResolvedValue(undefined as never);
    const { wrapper } = createQueryWrapper();
    const file = new File(["a,b"], "lines.csv", { type: "text/csv" });

    const { result } = renderHook(() => useImportPhoneLines("f1"), { wrapper });
    await result.current.mutateAsync(file);

    expect(mocked.importPhoneLines).toHaveBeenCalledWith("f1", file);
  });

  it("logCall invalidates the referral's call log", async () => {
    mocked.logCall.mockResolvedValue({ id: "c1" } as never);
    const { wrapper, queryClient } = createQueryWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useLogCall(), { wrapper });
    await result.current.mutateAsync({ referral_id: "r1", outcome: "ANSWERED" } as never);

    expect(mocked.logCall).toHaveBeenCalledWith({ referral_id: "r1", outcome: "ANSWERED" });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["calls", "r1"] });
  });
});
