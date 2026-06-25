export interface LocationPing {
  id: string;
  referral_id: string;
  latitude: number;
  longitude: number;
  ambulance_id: string | null;
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
  /** Planned road route (origin → destination) as ordered [lat, lng] points. */
  route: [number, number][] | null;
  /** Journey timing. ETA is computed by real road routing (OSRM). */
  departure_time: string | null;
  estimated_arrival_time: string | null;
  arrival_time: string | null;
}

export type AmbulanceStatus = "AVAILABLE" | "ON_JOURNEY";

export interface Ambulance {
  id: string;
  facility_id: string | null;
  facility_name: string | null;
  plate_number: string;
  driver_name: string | null;
  driver_phone: string | null;
  login_id: string;
  is_active: boolean;
  status: AmbulanceStatus;
  created_at: string;
}

export interface CreateAmbulancePayload {
  plate_number: string;
  driver_name?: string;
  driver_phone?: string;
  facility_id?: string;
  login_id: string;
}

export interface UpdateAmbulancePayload {
  plate_number?: string;
  driver_name?: string;
  driver_phone?: string;
  is_active?: boolean;
}

/** Returned once at registration or password reset: the ambulance plus the
 *  one-time plaintext password the driver's phone needs. */
export interface AmbulanceCredentials extends Ambulance {
  password: string;
}
