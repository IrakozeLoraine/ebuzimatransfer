import { CapacityRow } from "./facility";

export interface OccupancyRow {
    facility: string;
    unit_type: string;
    total_resources: number;
    occupied_resources: number;
    occupancy_rate: number;
}

export interface DashboardData {
    capacity: CapacityRow[];
}
