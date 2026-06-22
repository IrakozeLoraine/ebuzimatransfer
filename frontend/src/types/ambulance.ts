export interface LocationPing {
  id: string;
  referral_id: string;
  latitude: number;
  longitude: number;
  reported_by: string | null;
  recorded_at: string;
}

export interface RoutePoint {
  name: string;
  latitude: number;
  longitude: number;
}

export interface AmbulanceTrack {
  referral_id: string;
  origin: RoutePoint | null;
  destination: RoutePoint | null;
  pings: LocationPing[];
  latest: LocationPing | null;
}

export interface ReportPingPayload {
  latitude: number;
  longitude: number;
}
