import {
  AssignResourcePayload,
  CreateResourcePayload,
  Resource,
  ResourceFilters,
  ResourceImportResult,
  ResourceStatus,
  ResourceUsage,
} from "@/types/resource";
import { api } from "./axios";

export const getResources = async (filters: ResourceFilters = {}): Promise<Resource[]> => {
  const { data } = await api.get<Resource[]>("/resources", { params: filters });
  return data;
};

export const createResource = async (payload: CreateResourcePayload): Promise<Resource> => {
  const { data } = await api.post<Resource>("/resources", payload);
  return data;
};

export const updateResourceStatus = async (id: string, status: ResourceStatus): Promise<Resource> => {
  const { data } = await api.patch<Resource>(`/resources/${id}/status`, { status });
  return data;
};

export const assignResource = async (
  id: string,
  payload: AssignResourcePayload
): Promise<Resource> => {
  const { data } = await api.post<Resource>(`/resources/${id}/assign`, payload);
  return data;
};

export const importResources = async (file: File): Promise<ResourceImportResult> => {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await api.post<ResourceImportResult>("/resources/import", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
};

export const getResourceUsage = async (id: string): Promise<ResourceUsage> => {
  const { data } = await api.get<ResourceUsage>(`/resources/${id}/usage`);
  return data;
};

export const getAvailableResources = async (unitId?: string): Promise<Resource[]> => {
  const { data } = await api.get<Resource[]>("/resources/available", {
    params: unitId ? { unit_id: unitId } : {},
  });
  return data;
};

export const reserveResource = async (
  id: string,
  plannedAdmissionTime?: string
): Promise<Resource> => {
  const { data } = await api.post<Resource>(`/resources/${id}/reserve`, {
    planned_admission_time: plannedAdmissionTime ?? null,
  });
  return data;
};
