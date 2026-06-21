import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getUnits,
  createUnit,
  updateUnit,
  deleteUnit
} from "@/api/units.api";
import { CreateUnitPayload, UpdateUnitPayload } from "@/types/unit";

export const useUnits = () =>
  useQuery({ queryKey: ["units"], queryFn: getUnits });

export const useCreateUnit = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateUnitPayload) => createUnit(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["units"] }),
  });
};

export const useUpdateUnit = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateUnitPayload }) =>
      updateUnit(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["units"] }),
  });
};

export const useDeleteUnit = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteUnit(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["units"] }),
  });
};

export const useGetAllUnits = ({ enabled = true }: { enabled?: boolean }) => useQuery({
  queryKey: ["units"],
  queryFn: getUnits,
  enabled,
});