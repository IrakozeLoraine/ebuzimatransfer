export interface TransitStats {
    completed_journeys: number;
    average_minutes: number | null;
    fastest_minutes: number | null;
    slowest_minutes: number | null;
    arrival_conditions: Record<string, number>;
}
