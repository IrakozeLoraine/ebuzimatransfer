import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getFacilities, createFacility, updateFacility, deleteFacility } from "@/api/facilities.api";
import type { Facility } from "@/types/facility";

export const useFacilities = () =>
  useQuery({ queryKey: ["facilities"], queryFn: getFacilities });

export const useCreateFacility = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: Partial<Facility>) => createFacility(p),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["facilities"] }),
  });
};

export const useUpdateFacility = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<Facility> }) =>
      updateFacility(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["facilities"] }),
  });
};

export const useDeleteFacility = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteFacility(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["facilities"] }),
  });
};
