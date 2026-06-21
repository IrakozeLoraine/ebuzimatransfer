import { getDashboard, getOccupancyReport, getReferralReport } from "@/api/reports.api";
import { useQuery } from "@tanstack/react-query";

export const useGetDashboard = () => useQuery({
    queryKey: ["dashboard"],
    queryFn: getDashboard,
    refetchInterval: 30_000,
});

export const useGetCapacity = () => useQuery({
    queryKey: ["report-referrals"],
    queryFn: () => getReferralReport(),
});

export const useGetOccupancy = () => useQuery({
    queryKey: ["report-occupancy"],
    queryFn: getOccupancyReport,
});