import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getReferrals,
  getReferral,
  createReferral,
  acceptReferral,
  quickAcceptReferral,
  rejectReferral,
  updateReferralStatus,
  recordArrivalCondition,
  markReferralArrived,
  saveReferralFeedback,
  transcribeReferral,
} from "@/api/referrals.api";
import { createTransport, removeTransport } from "@/api/transport.api";
import type { CreateReferralPayload, AcceptReferralPayload, RejectReferralPayload, ArrivalCondition } from "@/types/referral";
import type { CreateTransportPayload } from "@/types/transport";

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

// Turn a dictated recording into prefilled form fields + transcript + summary.
// ``formSpec`` is the chosen MoH form's field list, so the service also fills the
// form-specific fields.
export const useTranscribeReferral = () =>
  useMutation({
    mutationFn: ({ audio, formSpec }: { audio: Blob; formSpec?: unknown }) =>
      transcribeReferral(audio, formSpec),
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

export const useRecordArrivalCondition = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, condition }: { id: string; condition: ArrivalCondition }) =>
      recordArrivalCondition(id, condition),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ["referrals"] });
      qc.invalidateQueries({ queryKey: ["referral", id] });
    },
  });
};

// Referring clinician arranges transport (their hospital's ambulance).
export const useArrangeTransport = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateTransportPayload) => createTransport(payload),
    onSuccess: (_, { referral_id }) => {
      qc.invalidateQueries({ queryKey: ["referrals"] });
      qc.invalidateQueries({ queryKey: ["referral", referral_id] });
    },
  });
};

// Referring clinician removes the assigned ambulance (before the journey starts).
export const useRemoveTransport = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (referralId: string) => removeTransport(referralId),
    onSuccess: (_, referralId) => {
      qc.invalidateQueries({ queryKey: ["referrals"] });
      qc.invalidateQueries({ queryKey: ["referral", referralId] });
    },
  });
};

// Receiving clinician confirms arrival for a transfer with no tracked transport.
export const useMarkArrived = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markReferralArrived(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["referrals"] });
      qc.invalidateQueries({ queryKey: ["referral", id] });
    },
  });
};

// Receiving clinician records the Referral Feedback / Counter-Referral.
export const useSaveReferralFeedback = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: { feedback_data?: Record<string, unknown>; counter_referral_data?: Record<string, unknown> };
    }) => saveReferralFeedback(id, payload),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ["referrals"] });
      qc.invalidateQueries({ queryKey: ["referral", id] });
    },
  });
};
