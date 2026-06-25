import { getTransitStats } from "@/api/reports.api";
import { useQuery } from "@tanstack/react-query";

export const useTransitStats = () => useQuery({
    queryKey: ["dashboard-transit-stats"],
    queryFn: getTransitStats,
    refetchInterval: 30_000,
});
