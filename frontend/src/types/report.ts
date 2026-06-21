export interface OccupancyRow {
    facility: string;
    unit_type: string;
    total_resources: number;
    occupied_resources: number;
    occupancy_rate: number;
}

export interface DashboardActivityRow {
    id: string;
    resource_name: string;
    facility_name: string | null;
    unit_name: string | null;
    reserved_by_name: string | null;
    planned_admission_time: string | null;
    created_at: string | null;
}
