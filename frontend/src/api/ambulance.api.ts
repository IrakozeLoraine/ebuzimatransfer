import { api } from "./axios";
import type { AmbulanceTrack, LocationPing, ReportPingPayload } from "@/types/ambulance";

export const getAmbulanceTrack = async (referralId: string): Promise<AmbulanceTrack> => {
  const { data } = await api.get<AmbulanceTrack>(`/ambulance/${referralId}/track`);
  return data;
};

export const reportPing = async (
  referralId: string,
  payload: ReportPingPayload
): Promise<LocationPing> => {
  const { data } = await api.post<LocationPing>(`/ambulance/${referralId}/pings`, payload);
  return data;
};
