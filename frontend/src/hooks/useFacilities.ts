import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getFacilities, getFacility, getFacilityUsers, createFacility, updateFacility, setFacilityLocation, deleteFacility, reactivateFacility, importFacilities } from "@/api/facilities.api";
import type { Facility } from "@/types/facility";
import { toast } from "@/components/ui/toaster";
import { getApiErrorMessage } from "@/utils/apiError";

export const useFacilities = () =>
  useQuery({ queryKey: ["facilities"], queryFn: getFacilities });

export const useFacility = (id: string | undefined) =>
  useQuery({ queryKey: ["facility", id], queryFn: () => getFacility(id!), enabled: !!id });

export const useFacilityUsers = (id: string | undefined) =>
  useQuery({ queryKey: ["facility", id, "users"], queryFn: () => getFacilityUsers(id!), enabled: !!id });

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

export const useSetFacilityLocation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, latitude, longitude }: { id: string; latitude: number; longitude: number }) =>
      setFacilityLocation(id, { latitude, longitude }),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ["facilities"] });
      qc.invalidateQueries({ queryKey: ["facility", id] });
      toast({ variant: "success", title: "Facility location saved" });
    },
    onError: (error) =>
      toast({
        variant: "destructive",
        title: "Failed to save facility location",
        description: getApiErrorMessage(error),
      }),
  });
};

export const useReactivateFacility = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => reactivateFacility(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ["facilities"] });
      qc.invalidateQueries({ queryKey: ["facility", id] });
      toast({ variant: "success", title: "Facility reactivated" });
    },
    onError: (error) =>
      toast({
        variant: "destructive",
        title: "Failed to reactivate facility",
        description: getApiErrorMessage(error),
      }),
  });
};

export const useImportFacilities = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => importFacilities(file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["facilities"] }),
  });
};

export const useDeleteFacility = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteFacility(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["facilities"] });
      toast({ variant: "success", title: "Facility deactivated" });
    },
    onError: (error) =>
      toast({
        variant: "destructive",
        title: "Failed to deactivate facility",
        description: getApiErrorMessage(error),
      }),
  });
};
