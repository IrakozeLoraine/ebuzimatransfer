import { api } from "./axios";
import type {
  PhoneLine,
  CreatePhoneLinePayload,
  PhoneLineImportResult,
  CallLog,
  LogCallPayload,
} from "@/types/call";

export const getPhoneLines = async (facilityId: string, activeOnly = true): Promise<PhoneLine[]> => {
  const { data } = await api.get<PhoneLine[]>("/calls/phone-lines", {
    params: { facility_id: facilityId, active_only: activeOnly },
  });
  return data;
};

export const createPhoneLine = async (facilityId: string, payload: CreatePhoneLinePayload): Promise<PhoneLine> => {
  const { data } = await api.post<PhoneLine>("/calls/phone-lines", payload, { params: { facility_id: facilityId } });
  return data;
};

export const deletePhoneLine = async (id: string): Promise<void> => {
  await api.delete(`/calls/phone-lines/${id}`);
};

export const importPhoneLines = async (
  facilityId: string,
  file: File,
): Promise<PhoneLineImportResult> => {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await api.post<PhoneLineImportResult>("/calls/phone-lines/import", formData, {
    params: { facility_id: facilityId },
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
};

export const logCall = async (payload: LogCallPayload): Promise<CallLog> => {
  const { data } = await api.post<CallLog>("/calls/log", payload);
  return data;
};

export const getCalls = async (referralId?: string): Promise<CallLog[]> => {
  const { data } = await api.get<CallLog[]>("/calls/log", {
    params: referralId ? { referral_id: referralId } : undefined,
  });
  return data;
};
