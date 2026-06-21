export interface TransportEvent {
  id: string;
  referral_id: string;
  ambulance_identifier: string;
  driver_name: string | null;
  driver_phone: string | null;
  dispatch_time: string | null;
  pickup_time: string | null;
  departure_time: string | null;
  arrival_time: string | null;
  created_at: string;
}

export interface CreateTransportPayload {
  referral_id: string;
  ambulance_identifier: string;
  driver_name?: string;
  driver_phone?: string;
}

export interface UpdateTransportPayload {
  dispatch_time?: string;
  pickup_time?: string;
  departure_time?: string;
  arrival_time?: string;
}
