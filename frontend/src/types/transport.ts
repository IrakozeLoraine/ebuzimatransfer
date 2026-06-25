export interface TransportEvent {
  id: string;
  referral_id: string;
  ambulance_id: string | null;
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
  ambulance_id: string;
}
