import { api } from "./axios";
import type {
  AmbulanceTrack,
  AmbulanceDevice,
  AmbulanceDeviceCreated,
} from "@/types/ambulance";

export const getAmbulanceTrack = async (referralId: string): Promise<AmbulanceTrack> => {
  const { data } = await api.get<AmbulanceTrack>(`/ambulance/${referralId}/track`);
  return data;
};

export const listDevices = async (): Promise<AmbulanceDevice[]> => {
  const { data } = await api.get<AmbulanceDevice[]>("/devices");
  return data;
};

export const createDevice = async (payload: {
  label: string;
  facility_id?: string;
}): Promise<AmbulanceDeviceCreated> => {
  const { data } = await api.post<AmbulanceDeviceCreated>("/devices", payload);
  return data;
};

export const setDeviceActive = async (
  id: string,
  isActive: boolean
): Promise<AmbulanceDevice> => {
  const { data } = await api.patch<AmbulanceDevice>(`/devices/${id}?is_active=${isActive}`);
  return data;
};
