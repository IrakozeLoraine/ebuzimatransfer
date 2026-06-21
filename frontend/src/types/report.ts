import { CapacityRow } from "./facility";

export interface ReferralReport {
    total_referrals: number;
    accepted: number;
    rejected: number;
    cancelled: number;
    en_route: number;
    arrived: number;
    acceptance_rate: number;
    rejection_rate: number;
    median_decision_minutes: number | null;
    avg_transport_minutes: number | null;
}

export interface OccupancyRow {
    facility: string;
    unit_type: string;
    total_resources: number;
    occupied_resources: number;
    occupancy_rate: number;
}

export interface DashboardData {
    referrals: {
        total: number;
        requested: number;
        under_review: number;
        accepted: number;
        en_route: number;
        arrived: number;
        active: number;
    };
    capacity: CapacityRow[];
}
