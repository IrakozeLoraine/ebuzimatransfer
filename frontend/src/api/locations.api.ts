import { api } from "./axios";

export const getProvinces = async (): Promise<string[]> => {
  const { data } = await api.get<string[]>("/locations/provinces");
  return data;
};

export const getDistricts = async (province: string): Promise<string[]> => {
  const { data } = await api.get<string[]>("/locations/districts", { params: { province } });
  return data;
};

export const getSectors = async (province: string, district: string): Promise<string[]> => {
  const { data } = await api.get<string[]>("/locations/sectors", { params: { province, district } });
  return data;
};

export const getCells = async (province: string, district: string, sector: string): Promise<string[]> => {
  const { data } = await api.get<string[]>("/locations/cells", { params: { province, district, sector } });
  return data;
};

export const getVillages = async (
  province: string,
  district: string,
  sector: string,
  cell: string
): Promise<string[]> => {
  const { data } = await api.get<string[]>("/locations/villages", {
    params: { province, district, sector, cell },
  });
  return data;
};
