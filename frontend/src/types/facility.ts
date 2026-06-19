export interface Facility {
  id: string;
  name: string;
  type: string;
  location: string | null;
  province: string | null;
  district: string | null;
  is_active: boolean;
}
