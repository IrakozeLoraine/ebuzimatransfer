import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listAmbulances,
  createAmbulance,
  updateAmbulance,
  resetAmbulancePassword,
} from "@/api/ambulance.api";

/** A facility's ambulances. Pass `available` to list only free, active ones
 * (used when arranging transport). */
export const useAmbulances = (available = false) =>
  useQuery({
    queryKey: ["ambulances", { available }],
    queryFn: () => listAmbulances(available),
  });

export const useCreateAmbulance = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createAmbulance,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ambulances"] }),
  });
};

export const useUpdateAmbulance = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof updateAmbulance>[1] }) =>
      updateAmbulance(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ambulances"] }),
  });
};

/** Regenerate the driver password. The returned credentials are shown once in the
 *  setup dialog (with a fresh QR code); the list is refreshed afterwards. */
export const useResetAmbulancePassword = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => resetAmbulancePassword(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ambulances"] }),
  });
};
