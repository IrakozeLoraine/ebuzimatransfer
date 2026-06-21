import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getResources, createResource, updateResourceStatus } from "@/api/resources.api";
import { getCapacity } from "@/api/dashboard.api";
import { CreateResourcePayload, ResourceStatus } from "@/types/resource";

export const useResources = () =>
  useQuery({ queryKey: ["resources"], queryFn: getResources });

export const useCapacity = () =>
  useQuery({ queryKey: ["capacity"], queryFn: getCapacity });

export const useCreateResource = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateResourcePayload) => createResource(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["resources"] });
      qc.invalidateQueries({ queryKey: ["capacity"] });
    },
  });
};

export const useUpdateResourceStatus = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ResourceStatus }) =>
      updateResourceStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["resources"] });
      qc.invalidateQueries({ queryKey: ["capacity"] });
    },
  });
};
