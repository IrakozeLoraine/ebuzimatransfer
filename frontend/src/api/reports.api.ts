import { TransitStats } from "@/types/report";
import { api } from "./axios";
import type { CapacityRow } from "@/types/facility";

export const getCapacity = async (): Promise<CapacityRow[]> => {
  const { data } = await api.get<CapacityRow[]>("/dashboard/capacity");
  return data;
};

export const getTransitStats = async (): Promise<TransitStats> => {
  const { data } = await api.get<TransitStats>("/dashboard/transit-stats");
  return data;
};
