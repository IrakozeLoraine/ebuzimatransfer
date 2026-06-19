import { AuditLog, AuditLogFilters } from "@/types/audit";
import { api } from "./axios";

export const getAuditLogs = async (filters?: AuditLogFilters): Promise<AuditLog[]> => {
  const { data } = await api.get<AuditLog[]>("/audit", { params: filters });
  return data;
};
