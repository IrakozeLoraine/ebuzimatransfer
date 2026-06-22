import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getPhoneLines,
  createPhoneLine,
  deletePhoneLine,
  logCall,
  getCalls,
} from "@/api/calls.api";
import type { CreatePhoneLinePayload, LogCallPayload } from "@/types/call";

export const usePhoneLines = (facilityId: string | undefined, activeOnly = true) =>
  useQuery({
    queryKey: ["phone-lines", facilityId, activeOnly],
    queryFn: () => getPhoneLines(facilityId as string, activeOnly),
    enabled: !!facilityId,
  });

export const useCreatePhoneLine = (facilityId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreatePhoneLinePayload) => createPhoneLine(facilityId, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["phone-lines", facilityId] }),
  });
};

export const useDeletePhoneLine = (facilityId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deletePhoneLine(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["phone-lines", facilityId] }),
  });
};

export const useCalls = (referralId?: string) =>
  useQuery({
    queryKey: ["calls", referralId],
    queryFn: () => getCalls(referralId),
    enabled: !!referralId,
  });

export const useLogCall = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: LogCallPayload) => logCall(payload),
    onSuccess: (_, payload) => qc.invalidateQueries({ queryKey: ["calls", payload.referral_id] }),
  });
};
