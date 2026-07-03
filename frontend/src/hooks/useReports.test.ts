import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { createQueryWrapper } from "@/test/queryWrapper";
import { useTransitStats } from "./useReport";
import { useGetAllAuditLogs } from "./useAuditLogs";
import { useInAppCalls, useInAppCallsLog } from "./useInAppCalls";
import * as reportsApi from "@/api/reports.api";
import * as auditApi from "@/api/audit.api";
import * as incallApi from "@/api/incall.api";

vi.mock("@/api/reports.api");
vi.mock("@/api/audit.api");
vi.mock("@/api/incall.api");
const reports = vi.mocked(reportsApi);
const audit = vi.mocked(auditApi);
const incall = vi.mocked(incallApi);

beforeEach(() => vi.clearAllMocks());

describe("useTransitStats", () => {
  it("fetches dashboard transit stats", async () => {
    reports.getTransitStats.mockResolvedValue({ in_transit: 2 } as never);
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(() => useTransitStats(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(reports.getTransitStats).toHaveBeenCalled();
  });
});

describe("useGetAllAuditLogs", () => {
  it("fetches audit logs", async () => {
    audit.getAuditLogs.mockResolvedValue([] as never);
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(() => useGetAllAuditLogs(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(audit.getAuditLogs).toHaveBeenCalled();
  });
});

describe("useInAppCalls", () => {
  it("fetches in-app calls for a referral", async () => {
    incall.getInAppCalls.mockResolvedValue([] as never);
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(() => useInAppCalls("r1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(incall.getInAppCalls).toHaveBeenCalledWith("r1");
  });

  it("fetches the in-app call log filtered by status", async () => {
    incall.getInAppCallsLog.mockResolvedValue([] as never);
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(() => useInAppCallsLog("MISSED"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(incall.getInAppCallsLog).toHaveBeenCalledWith("MISSED");
  });
});
