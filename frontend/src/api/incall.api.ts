import { api } from "./axios";
import type { InAppCall, SignalKind } from "@/types/incall";

export const initiateCall = async (payload: { facility_id: string; unit_id?: string; referral_id?: string }): Promise<InAppCall> => {
  const { data } = await api.post<InAppCall>("/calls/in-app", payload);
  return data;
};

/** Clinician calls a facility's ambulance — the driver's phone app rings. */
export const initiateAmbulanceCall = async (payload: { ambulance_id: string; referral_id?: string }): Promise<InAppCall> => {
  const { data } = await api.post<InAppCall>("/calls/in-app/ambulance", payload);
  return data;
};

export const answerCall = async (id: string): Promise<InAppCall> => {
  const { data } = await api.post<InAppCall>(`/calls/in-app/${id}/answer`);
  return data;
};

export const endCall = async (id: string): Promise<InAppCall> => {
  const { data } = await api.post<InAppCall>(`/calls/in-app/${id}/end`);
  return data;
};

export const sendSignal = async (id: string, kind: SignalKind, data: unknown): Promise<void> => {
  await api.post(`/calls/in-app/${id}/signal`, { kind, data });
};

export const getInAppCalls = async (referralId?: string): Promise<InAppCall[]> => {
  const { data } = await api.get<InAppCall[]>("/calls/in-app", {
    params: referralId ? { referral_id: referralId } : undefined,
  });
  return data;
};

/** Call log scoped to the viewer: all calls (super admin) or calls involving their facility. */
export const getInAppCallsLog = async (status?: string): Promise<InAppCall[]> => {
  const { data } = await api.get<InAppCall[]>("/calls/in-app/log", {
    params: status ? { status } : undefined,
  });
  return data;
};
