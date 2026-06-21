import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getResources,
  createResource,
  updateResourceStatus,
  assignResource,
  importResources,
  getResourceUsage,
} from "@/api/resources.api";
import { getCapacity } from "@/api/reports.api";
import {
  AssignResourcePayload,
  CreateResourcePayload,
  ResourceFilters,
  ResourceStatus,
} from "@/types/resource";

export const useResources = (filters: ResourceFilters = {}) =>
  useQuery({ queryKey: ["resources", filters], queryFn: () => getResources(filters) });

export const useCapacity = () =>
  useQuery({ queryKey: ["capacity"], queryFn: getCapacity });

const invalidateResourceData = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ["resources"] });
  qc.invalidateQueries({ queryKey: ["capacity"] });
};

export const useCreateResource = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateResourcePayload) => createResource(payload),
    onSuccess: () => invalidateResourceData(qc),
  });
};

export const useUpdateResourceStatus = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ResourceStatus }) =>
      updateResourceStatus(id, status),
    onSuccess: () => invalidateResourceData(qc),
  });
};

export const useAssignResource = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: AssignResourcePayload }) =>
      assignResource(id, payload),
    onSuccess: () => invalidateResourceData(qc),
  });
};

export const useImportResources = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => importResources(file),
    onSuccess: () => invalidateResourceData(qc),
  });
};

export const useResourceUsage = (id: string | null) =>
  useQuery({
    queryKey: ["resource-usage", id],
    queryFn: () => getResourceUsage(id as string),
    enabled: !!id,
  });
