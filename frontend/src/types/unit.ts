export type FacilityTier = "HEALTH_CENTER_POST" | "DISTRICT" | "LEVEL_TWO" | "NRH_UTH";

export interface Unit {
    id: string;
    name: string;
    code: string | null;
    tier: FacilityTier;
    is_active: boolean;
}

export interface CreateUnitPayload {
    name: string;
    tier: FacilityTier;
    code?: string;
}

export interface UpdateUnitPayload {
    name?: string;
    tier?: FacilityTier;
    code?: string;
    is_active?: boolean;
}

export interface UnitListParams {
    /** Narrow to the units a facility's tier is eligible for (cascading). */
    facility_id?: string;
    active?: boolean;
}

export interface UnitImportError {
    row: number;
    message: string;
}

export interface UnitImportResult {
    created: number;
    errors: UnitImportError[];
}
