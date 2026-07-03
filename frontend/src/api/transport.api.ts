import { api } from "./axios";
import type { TransportEvent, CreateTransportPayload } from "@/types/transport";

export const createTransport = async (payload: CreateTransportPayload): Promise<TransportEvent> => {
  const { data } = await api.post<TransportEvent>("/transport", payload);
  return data;
};

/** Remove the assigned ambulance (before the journey starts) so another can be picked. */
export const removeTransport = async (referralId: string): Promise<void> => {
  await api.delete(`/transport/${referralId}`);
};
