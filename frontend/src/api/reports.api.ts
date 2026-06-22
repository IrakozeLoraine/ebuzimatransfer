import { OccupancyRow, DashboardActivityRow, TransitStats } from "@/types/report";
import { api } from "./axios";
import type { CapacityRow } from "@/types/facility";

export const getCapacity = async (): Promise<CapacityRow[]> => {
  const { data } = await api.get<CapacityRow[]>("/dashboard/capacity");
  return data;
};

export const getDashboardActivity = async (): Promise<DashboardActivityRow[]> => {
  const { data } = await api.get<DashboardActivityRow[]>("/dashboard/activity");
  return data;
};

export const getTransitStats = async (): Promise<TransitStats> => {
  const { data } = await api.get<TransitStats>("/dashboard/transit-stats");
  return data;
};

export const getOccupancyReport = async (): Promise<OccupancyRow[]> => {
  const { data } = await api.get<OccupancyRow[]>("/reports/occupancy");
  return data;
};

export const exportCsv = () => window.open(`${import.meta.env.VITE_API_BASE_URL ?? "/api/v1"}/reports/export/csv`);
export const exportExcel = () => window.open(`${import.meta.env.VITE_API_BASE_URL ?? "/api/v1"}/reports/export/excel`);
