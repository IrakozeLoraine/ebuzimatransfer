import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listDevices, createDevice, setDeviceActive } from "@/api/ambulance.api";

/** Registered hardware GPS trackers for the current facility. */
export const useDevices = () =>
  useQuery({ queryKey: ["ambulance-devices"], queryFn: listDevices });

export const useCreateDevice = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createDevice,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ambulance-devices"] }),
  });
};

export const useSetDeviceActive = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      setDeviceActive(id, isActive),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ambulance-devices"] }),
  });
};
