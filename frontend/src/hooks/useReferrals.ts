import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getReferrals,
  getReferral,
  createReferral,
  acceptReferral,
  quickAcceptReferral,
  rejectReferral,
  updateReferralStatus,
} from "@/api/referrals.api";
import type { CreateReferralPayload, AcceptReferralPayload, RejectReferralPayload } from "@/types/referral";

export const useReferrals = (params?: { status?: string }) =>
  useQuery({
    queryKey: ["referrals", params],
    queryFn: () => getReferrals(params),
  });

export const useReferral = (id: string) =>
  useQuery({
    queryKey: ["referral", id],
    queryFn: () => getReferral(id),
    enabled: !!id,
  });

export const useCreateReferral = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: CreateReferralPayload) => createReferral(p),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["referrals"] }),
  });
};

export const useAcceptReferral = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: AcceptReferralPayload }) =>
      acceptReferral(id, payload),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ["referrals"] });
      qc.invalidateQueries({ queryKey: ["referral", id] });
      qc.invalidateQueries({ queryKey: ["capacity"] });
    },
  });
};

export const useQuickAcceptReferral = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => quickAcceptReferral(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["referrals"] });
      qc.invalidateQueries({ queryKey: ["referral", id] });
      qc.invalidateQueries({ queryKey: ["capacity"] });
    },
  });
};

export const useRejectReferral = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: RejectReferralPayload }) =>
      rejectReferral(id, payload),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ["referrals"] });
      qc.invalidateQueries({ queryKey: ["referral", id] });
    },
  });
};

export const useUpdateReferralStatus = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      updateReferralStatus(id, status),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ["referrals"] });
      qc.invalidateQueries({ queryKey: ["referral", id] });
    },
  });
};
