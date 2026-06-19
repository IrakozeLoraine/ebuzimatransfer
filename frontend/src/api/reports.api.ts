import { OccupancyRow, ReferralReport } from "@/types/report";
import { api } from "./axios";

export const getReferralReport = async (params?: { from_date?: string; to_date?: string }): Promise<ReferralReport> => {
  const { data } = await api.get<ReferralReport>("/reports/referrals", { params });
  return data;
};

export const getOccupancyReport = async (): Promise<OccupancyRow[]> => {
  const { data } = await api.get<OccupancyRow[]>("/reports/occupancy");
  return data;
};

export const exportCsv = () => window.open(`${import.meta.env.VITE_API_BASE_URL ?? "/api/v1"}/reports/export/csv`);
export const exportExcel = () => window.open(`${import.meta.env.VITE_API_BASE_URL ?? "/api/v1"}/reports/export/excel`);
