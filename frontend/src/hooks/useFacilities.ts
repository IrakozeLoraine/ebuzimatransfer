import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getFacilities, createFacility, updateFacility, deleteFacility } from "@/api/facilities.api";
import type { Facility } from "@/types/facility";
import { toast } from "@/components/ui/toaster";
import { getApiErrorMessage } from "@/utils/apiError";

export const useFacilities = () =>
  useQuery({ queryKey: ["facilities"], queryFn: getFacilities });

export const useCreateFacility = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: Partial<Facility>) => createFacility(p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["facilities"] });
      toast({ variant: "success", title: "Facility created" });
    },
    onError: (error) =>
      toast({
        variant: "destructive",
        title: "Failed to create facility",
        description: getApiErrorMessage(error),
      }),
  });
};

export const useUpdateFacility = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<Facility> }) =>
      updateFacility(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["facilities"] });
      toast({ variant: "success", title: "Facility updated" });
    },
    onError: (error) =>
      toast({
        variant: "destructive",
        title: "Failed to update facility",
        description: getApiErrorMessage(error),
      }),
  });
};

export const useDeleteFacility = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteFacility(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["facilities"] });
      toast({ variant: "success", title: "Facility deleted" });
    },
    onError: (error) =>
      toast({
        variant: "destructive",
        title: "Failed to delete facility",
        description: getApiErrorMessage(error),
      }),
  });
};
