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
  /** Planned road route (origin → destination) as ordered [lat, lng] points. */
  route: [number, number][] | null;
  /** Journey timing. ETA is computed by real road routing (OSRM). */
  departure_time: string | null;
  estimated_arrival_time: string | null;
  arrival_time: string | null;
}

export interface AmbulanceDevice {
  id: string;
  label: string;
  facility_id: string | null;
  is_active: boolean;
  created_at: string;
}

/** Returned once at creation — includes the plaintext key to flash onto the device. */
export interface AmbulanceDeviceCreated extends AmbulanceDevice {
  api_key: string;
}
