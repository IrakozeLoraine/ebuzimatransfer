import { api } from "./axios";
import type { TransportEvent, CreateTransportPayload, UpdateTransportPayload } from "@/types/transport";

export const createTransport = async (payload: CreateTransportPayload): Promise<TransportEvent> => {
  const { data } = await api.post<TransportEvent>("/transport", payload);
  return data;
};

export const updateTransport = async (id: string, payload: UpdateTransportPayload): Promise<TransportEvent> => {
  const { data } = await api.patch<TransportEvent>(`/transport/${id}`, payload);
  return data;
};
