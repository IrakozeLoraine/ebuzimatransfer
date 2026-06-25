import { api } from "./axios";
import type {
  AmbulanceTrack,
  Ambulance,
  AmbulanceCredentials,
  CreateAmbulancePayload,
  UpdateAmbulancePayload,
} from "@/types/ambulance";

export const getAmbulanceTrack = async (referralId: string): Promise<AmbulanceTrack> => {
  const { data } = await api.get<AmbulanceTrack>(`/ambulance/${referralId}/track`);
  return data;
};

export const listAmbulances = async (available = false): Promise<Ambulance[]> => {
  const { data } = await api.get<Ambulance[]>("/ambulances", {
    params: available ? { available: true } : {},
  });
  return data;
};

export const createAmbulance = async (
  payload: CreateAmbulancePayload
): Promise<AmbulanceCredentials> => {
  const { data } = await api.post<AmbulanceCredentials>("/ambulances", payload);
  return data;
};

export const updateAmbulance = async (
  id: string,
  payload: UpdateAmbulancePayload
): Promise<Ambulance> => {
  const { data } = await api.patch<Ambulance>(`/ambulances/${id}`, payload);
  return data;
};

/** Regenerate the driver password; the response carries the new one-time password. */
export const resetAmbulancePassword = async (id: string): Promise<AmbulanceCredentials> => {
  const { data } = await api.post<AmbulanceCredentials>(`/ambulances/${id}/reset-password`);
  return data;
};
