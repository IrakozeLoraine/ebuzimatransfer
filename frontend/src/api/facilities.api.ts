import { api } from "./axios";
import type { Facility, FacilityImportResult } from "@/types/facility";
import type { User } from "@/types/user";

export const getFacilities = async (): Promise<Facility[]> => {
  const { data } = await api.get<Facility[]>("/facilities");
  return data;
};

export const getFacility = async (id: string): Promise<Facility> => {
  const { data } = await api.get<Facility>(`/facilities/${id}`);
  return data;
};

export const getFacilityUsers = async (id: string): Promise<User[]> => {
  const { data } = await api.get<User[]>(`/facilities/${id}/users`);
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

export const reactivateFacility = async (id: string): Promise<Facility> => {
  const { data } = await api.put<Facility>(`/facilities/${id}`, { is_active: true });
  return data;
};

export const importFacilities = async (file: File): Promise<FacilityImportResult> => {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await api.post<FacilityImportResult>("/facilities/import", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
};
