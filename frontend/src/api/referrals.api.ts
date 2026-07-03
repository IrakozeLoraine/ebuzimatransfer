import { api } from "./axios";
import type { Referral, CreateReferralPayload, AcceptReferralPayload, RejectReferralPayload, ArrivalCondition, DictationResult } from "@/types/referral";

export const transcribeReferral = async (audio: Blob, formSpec?: unknown): Promise<DictationResult> => {
  const form = new FormData();
  // Send as .webm — what the browser MediaRecorder produces by default.
  form.append("audio", audio, "referral.webm");
  // The chosen MoH form's field list, so the service can also fill form-specific fields.
  if (formSpec) form.append("form_spec", JSON.stringify(formSpec));
  const { data } = await api.post<DictationResult>("/referrals/transcribe", form, {
    headers: { "Content-Type": "multipart/form-data" },
    // Transcription + extraction can take a while; don't let the default timeout abort it.
    timeout: 180_000,
  });
  return data;
};

export const getReferrals = async (params?: { status?: string; facility_id?: string }): Promise<Referral[]> => {
  const { data } = await api.get<Referral[]>("/referrals", { params });
  return data;
};

export const getReferral = async (id: string): Promise<Referral> => {
  const { data } = await api.get<Referral>(`/referrals/${id}`);
  return data;
};

export const createReferral = async (payload: CreateReferralPayload): Promise<Referral> => {
  const { data } = await api.post<Referral>("/referrals", payload);
  return data;
};

export const acceptReferral = async (id: string, payload: AcceptReferralPayload): Promise<Referral> => {
  const { data } = await api.post<Referral>(`/referrals/${id}/accept`, payload);
  return data;
};

export const quickAcceptReferral = async (id: string): Promise<Referral> => {
  const { data } = await api.post<Referral>(`/referrals/${id}/quick-accept`);
  return data;
};

export const rejectReferral = async (id: string, payload: RejectReferralPayload): Promise<Referral> => {
  const { data } = await api.post<Referral>(`/referrals/${id}/reject`, payload);
  return data;
};

export const updateReferralStatus = async (id: string, status: string): Promise<void> => {
  await api.patch(`/referrals/${id}/status`, null, { params: { status } });
};

export const recordArrivalCondition = async (
  id: string,
  arrival_condition: ArrivalCondition
): Promise<Referral> => {
  const { data } = await api.post<Referral>(`/referrals/${id}/arrival-condition`, { arrival_condition });
  return data;
};

export const markReferralArrived = async (id: string): Promise<Referral> => {
  const { data } = await api.post<Referral>(`/referrals/${id}/mark-arrived`);
  return data;
};

export const saveReferralFeedback = async (
  id: string,
  payload: { feedback_data?: Record<string, unknown>; counter_referral_data?: Record<string, unknown> }
): Promise<Referral> => {
  const { data } = await api.patch<Referral>(`/referrals/${id}/feedback`, payload);
  return data;
};
