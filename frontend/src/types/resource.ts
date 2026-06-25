export type ResourceStatus = "AVAILABLE" | "OCCUPIED" | "RESERVED" | "OUT_OF_SERVICE";

export type ResourceType =
    | "Mechanical Ventilation"
    | "Advanced Respiratory Support"
    | "Vasopressor/Inotrope Infusions"
    | "Invasive Hemodynamic Monitoring"
    | "Emergency Surgery"
    | "Acute Renal Replacement Therapy"
    | "Neurological Emergencies"
    | "CT Scans/MRI"
    | "Advanced Blood Analysis";

export const RESOURCE_TYPES: ResourceType[] = [
    "Mechanical Ventilation",
    "Advanced Respiratory Support",
    "Vasopressor/Inotrope Infusions",
    "Invasive Hemodynamic Monitoring",
    "Emergency Surgery",
    "Acute Renal Replacement Therapy",
    "Neurological Emergencies",
    "CT Scans/MRI",
    "Advanced Blood Analysis",
];

export interface Resource {
    id: string;
    unit_id: string | null;
    facility_id: string | null;
    resource_name: string;
    resource_code: string | null;
    resource_type: ResourceType | null;
    quantity: number;
    occupied: number;
    reserved: number;
    out_of_service: number;
    available: number;
    notes: string | null;
    facility_name?: string | null;
    unit_name?: string | null;
}

export interface CreateResourcePayload {
    unit_id?: string;
    facility_id?: string;
    resource_name: string;
    resource_code?: string;
    resource_type?: ResourceType;
    quantity?: number;
    notes?: string;
}

export interface ResourceCountsPayload {
    occupied: number;
    reserved: number;
    out_of_service: number;
}

export interface BulkAssignResourcePayload {
    resource_ids: string[];
    facility_id?: string | null;
    unit_id?: string | null;
    /** Units to move from each resource (clamped to what's movable); omit to move all. */
    quantity?: number | null;
}

export interface ResourceImportError {
    row: number;
    message: string;
}

export interface ResourceImportResult {
    created: number;
    errors: ResourceImportError[];
}

export interface ReservationEntry {
    id: string;
    reserved_by: string;
    reserved_by_name: string | null;
    planned_admission_time: string | null;
    created_at: string | null;
}

export interface ResourceUsage {
    resource: Resource;
    reservations: ReservationEntry[];
}

export interface ResourceFilters {
    unassigned?: boolean;
    facility_id?: string;
    status?: ResourceStatus;
}
