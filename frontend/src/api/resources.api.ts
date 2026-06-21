import { CreateResourcePayload, Resource, ResourceStatus } from "@/types/resource";
import { api } from "./axios";

export const getResources = async (): Promise<Resource[]> => {
  const { data } = await api.get<Resource[]>("/resources");
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
