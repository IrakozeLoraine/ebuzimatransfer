import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { createQueryWrapper } from "@/test/queryWrapper";
import {
  useReferrals,
  useReferral,
  useCreateReferral,
  useAcceptReferral,
  useQuickAcceptReferral,
  useRejectReferral,
  useUpdateReferralStatus,
  useRecordArrivalCondition,
  useArrangeTransport,
  useRemoveTransport,
  useMarkArrived,
  useSaveReferralFeedback,
} from "./useReferrals";
import * as referralsApi from "@/api/referrals.api";
import * as transportApi from "@/api/transport.api";

vi.mock("@/api/referrals.api");
vi.mock("@/api/transport.api");

const mocked = vi.mocked(referralsApi);
const transportMocked = vi.mocked(transportApi);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useReferrals queries", () => {
  it("fetches the referral list with the given params", async () => {
    mocked.getReferrals.mockResolvedValue([{ id: "r1" }] as never);
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(() => useReferrals({ status: "PENDING" }), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocked.getReferrals).toHaveBeenCalledWith({ status: "PENDING" });
    expect(result.current.data).toEqual([{ id: "r1" }]);
  });

  it("fetches a single referral by id", async () => {
    mocked.getReferral.mockResolvedValue({ id: "r1" } as never);
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(() => useReferral("r1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocked.getReferral).toHaveBeenCalledWith("r1");
  });

  it("does not fetch a single referral when the id is empty", () => {
    const { wrapper } = createQueryWrapper();

    renderHook(() => useReferral(""), { wrapper });

    expect(mocked.getReferral).not.toHaveBeenCalled();
  });
});

describe("useReferrals mutations", () => {
  it("createReferral invalidates the referrals list on success", async () => {
    mocked.createReferral.mockResolvedValue({ id: "r1" } as never);
    const { wrapper, queryClient } = createQueryWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCreateReferral(), { wrapper });
    await result.current.mutateAsync({ patient_name: "Ada" } as never);

    expect(mocked.createReferral).toHaveBeenCalledWith({ patient_name: "Ada" });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["referrals"] });
  });

  it("acceptReferral invalidates the list, the referral and capacity", async () => {
    mocked.acceptReferral.mockResolvedValue({ id: "r1" } as never);
    const { wrapper, queryClient } = createQueryWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useAcceptReferral(), { wrapper });
    await result.current.mutateAsync({ id: "r1", payload: { unit_id: "u1" } as never });

    expect(mocked.acceptReferral).toHaveBeenCalledWith("r1", { unit_id: "u1" });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["referrals"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["referral", "r1"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["capacity"] });
  });

  it("quickAcceptReferral accepts by id and invalidates capacity", async () => {
    mocked.quickAcceptReferral.mockResolvedValue({ id: "r1" } as never);
    const { wrapper, queryClient } = createQueryWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useQuickAcceptReferral(), { wrapper });
    await result.current.mutateAsync("r1");

    expect(mocked.quickAcceptReferral).toHaveBeenCalledWith("r1");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["capacity"] });
  });

  it("rejectReferral sends the payload and invalidates the referral", async () => {
    mocked.rejectReferral.mockResolvedValue({ id: "r1" } as never);
    const { wrapper, queryClient } = createQueryWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useRejectReferral(), { wrapper });
    await result.current.mutateAsync({ id: "r1", payload: { reason: "no beds" } as never });

    expect(mocked.rejectReferral).toHaveBeenCalledWith("r1", { reason: "no beds" });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["referral", "r1"] });
  });

  it("updateReferralStatus forwards the new status", async () => {
    mocked.updateReferralStatus.mockResolvedValue(undefined as never);
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(() => useUpdateReferralStatus(), { wrapper });
    await result.current.mutateAsync({ id: "r1", status: "IN_TRANSIT" });

    expect(mocked.updateReferralStatus).toHaveBeenCalledWith("r1", "IN_TRANSIT");
  });

  it("recordArrivalCondition forwards the condition", async () => {
    mocked.recordArrivalCondition.mockResolvedValue({ id: "r1" } as never);
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(() => useRecordArrivalCondition(), { wrapper });
    await result.current.mutateAsync({ id: "r1", condition: { stable: true } as never });

    expect(mocked.recordArrivalCondition).toHaveBeenCalledWith("r1", { stable: true });
  });

  it("arrangeTransport creates transport and invalidates the referral", async () => {
    transportMocked.createTransport.mockResolvedValue({ id: "t1" } as never);
    const { wrapper, queryClient } = createQueryWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useArrangeTransport(), { wrapper });
    await result.current.mutateAsync({ referral_id: "r1", ambulance_id: "a1" } as never);

    expect(transportMocked.createTransport).toHaveBeenCalledWith({ referral_id: "r1", ambulance_id: "a1" });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["referral", "r1"] });
  });

  it("removeTransport removes by referral id", async () => {
    transportMocked.removeTransport.mockResolvedValue(undefined as never);
    const { wrapper, queryClient } = createQueryWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useRemoveTransport(), { wrapper });
    await result.current.mutateAsync("r1");

    expect(transportMocked.removeTransport).toHaveBeenCalledWith("r1");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["referral", "r1"] });
  });

  it("markArrived confirms arrival by id", async () => {
    mocked.markReferralArrived.mockResolvedValue({ id: "r1" } as never);
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(() => useMarkArrived(), { wrapper });
    await result.current.mutateAsync("r1");

    expect(mocked.markReferralArrived).toHaveBeenCalledWith("r1");
  });

  it("saveReferralFeedback forwards the feedback payload", async () => {
    mocked.saveReferralFeedback.mockResolvedValue({ id: "r1" } as never);
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(() => useSaveReferralFeedback(), { wrapper });
    const payload = { feedback_data: { outcome: "improved" } };
    await result.current.mutateAsync({ id: "r1", payload });

    expect(mocked.saveReferralFeedback).toHaveBeenCalledWith("r1", payload);
  });
});
