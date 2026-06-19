import { api } from "./axios";

export const getProvinces = async (): Promise<string[]> => {
  const { data } = await api.get<string[]>("/locations/provinces");
  return data;
};

export const getDistricts = async (province: string): Promise<string[]> => {
  const { data } = await api.get<string[]>(`/locations/provinces/${encodeURIComponent(province)}/districts`);
  return data;
};
