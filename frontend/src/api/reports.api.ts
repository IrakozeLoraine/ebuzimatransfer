import { OccupancyRow } from "@/types/report";
import { api } from "./axios";
import { DashboardData } from "@/types/report";
import type { CapacityRow } from "@/types/facility";

export const getDashboard = async (): Promise<DashboardData> => {
  const { data } = await api.get<DashboardData>("/dashboard");
  return data;
};

export const getCapacity = async (): Promise<CapacityRow[]> => {
  const { data } = await api.get<CapacityRow[]>("/dashboard/capacity");
  return data;
};

export const getOccupancyReport = async (): Promise<OccupancyRow[]> => {
  const { data } = await api.get<OccupancyRow[]>("/reports/occupancy");
  return data;
};

export const exportCsv = () => window.open(`${import.meta.env.VITE_API_BASE_URL ?? "/api/v1"}/reports/export/csv`);
export const exportExcel = () => window.open(`${import.meta.env.VITE_API_BASE_URL ?? "/api/v1"}/reports/export/excel`);
