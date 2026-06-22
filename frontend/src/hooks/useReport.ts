import { getOccupancyReport, getDashboardActivity, getTransitStats } from "@/api/reports.api";
import { useQuery } from "@tanstack/react-query";

export const useDashboardActivity = () => useQuery({
    queryKey: ["dashboard-activity"],
    queryFn: getDashboardActivity,
    refetchInterval: 30_000,
});

export const useTransitStats = () => useQuery({
    queryKey: ["dashboard-transit-stats"],
    queryFn: getTransitStats,
    refetchInterval: 30_000,
});

export const useGetOccupancy = () => useQuery({
    queryKey: ["report-occupancy"],
    queryFn: getOccupancyReport,
});