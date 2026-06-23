import { api } from "./axios";
import type { Referral, CreateReferralPayload, AcceptReferralPayload, RejectReferralPayload, ArrivalCondition } from "@/types/referral";

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
