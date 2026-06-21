import { api } from "./axios";
import type { Referral, CreateReferralPayload, AcceptReferralPayload, RejectReferralPayload } from "@/types/referral";

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

export const rejectReferral = async (id: string, payload: RejectReferralPayload): Promise<Referral> => {
  const { data } = await api.post<Referral>(`/referrals/${id}/reject`, payload);
  return data;
};

export const updateReferralStatus = async (id: string, status: string): Promise<void> => {
  await api.patch(`/referrals/${id}/status`, null, { params: { status } });
};
