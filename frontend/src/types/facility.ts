export interface Facility {
  id: string;
  name: string;
  type: string;
  location: string | null;
  province: string | null;
  district: string | null;
  latitude: number | null;
  longitude: number | null;
  is_active: boolean;
}

export interface FacilityImportError {
  row: number;
  message: string;
}

export interface FacilityImportResult {
  created: number;
  errors: FacilityImportError[];
}

export interface CapacityRow {
  facility_id: string;
  facility: string;
  unit_type: string;
  total: number;
  available: number;
  occupied: number;
  reserved: number;
  out_of_service: number;
  ventilators: number;
  high_flow_oxygen: number;
}
