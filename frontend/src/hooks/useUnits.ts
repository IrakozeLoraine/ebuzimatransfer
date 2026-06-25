import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getUnits,
  createUnit,
  updateUnit,
  deleteUnit,
  importUnits
} from "@/api/units.api";
import { CreateUnitPayload, UnitListParams, UpdateUnitPayload } from "@/types/unit";

export const useUnits = (
  params: UnitListParams = {},
  options: { enabled?: boolean } = {}
) =>
  useQuery({
    queryKey: ["units", params],
    queryFn: () => getUnits(params),
    enabled: options.enabled ?? true,
  });

/** Backwards-compatible alias for callers that just want the full catalog. */
export const useGetAllUnits = ({ enabled = true }: { enabled?: boolean }) =>
  useUnits({}, { enabled });

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

export const useImportUnits = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => importUnits(file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["units"] }),
  });
};
