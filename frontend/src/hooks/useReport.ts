import { getOccupancyReport, getDashboardActivity } from "@/api/reports.api";
import { useQuery } from "@tanstack/react-query";

export const useDashboardActivity = () => useQuery({
    queryKey: ["dashboard-activity"],
    queryFn: getDashboardActivity,
    refetchInterval: 30_000,
});

export const useGetOccupancy = () => useQuery({
    queryKey: ["report-occupancy"],
    queryFn: getOccupancyReport,
});