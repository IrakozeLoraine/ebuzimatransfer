import { api } from "./axios";
import type { Facility } from "@/types/facility";

export const getFacilities = async (): Promise<Facility[]> => {
  const { data } = await api.get<Facility[]>("/facilities");
  return data;
};

export const createFacility = async (payload: Partial<Facility>): Promise<Facility> => {
  const { data } = await api.post<Facility>("/facilities", payload);
  return data;
};

export const updateFacility = async (id: string, payload: Partial<Facility>): Promise<Facility> => {
  const { data } = await api.put<Facility>(`/facilities/${id}`, payload);
  return data;
};

export const deleteFacility = async (id: string): Promise<void> => {
  await api.delete(`/facilities/${id}`);
};
