import { api } from "./axios";
import {
  CreateUnitPayload,
  Unit,
  UnitImportResult,
  UnitListParams,
  UpdateUnitPayload,
} from "@/types/unit";

export const getUnits = async (params: UnitListParams = {}): Promise<Unit[]> => {
  const { data } = await api.get<Unit[]>("/units", { params });
  return data;
};

export const createUnit = async (payload: CreateUnitPayload): Promise<Unit> => {
  const { data } = await api.post<Unit>("/units", payload);
  return data;
};

export const updateUnit = async (id: string, payload: UpdateUnitPayload): Promise<Unit> => {
  const { data } = await api.put<Unit>(`/units/${id}`, payload);
  return data;
};

export const deleteUnit = async (id: string): Promise<void> => {
  await api.delete(`/units/${id}`);
};

export const importUnits = async (file: File): Promise<UnitImportResult> => {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await api.post<UnitImportResult>("/units/import", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
};
