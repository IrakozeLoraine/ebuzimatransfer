import { api } from "./axios";
import type { TransportEvent, CreateTransportPayload } from "@/types/transport";

export const createTransport = async (payload: CreateTransportPayload): Promise<TransportEvent> => {
  const { data } = await api.post<TransportEvent>("/transport", payload);
  return data;
};
