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
    unit_id: string;
    resource_name: string;
    resource_code: string;
    resource_type: ResourceType | null;
    quantity: number;
    status: ResourceStatus;
    notes: string | null;
}

export interface CreateResourcePayload {
    unit_id: string;
    resource_name: string;
    resource_code: string;
    resource_type?: ResourceType;
    quantity?: number;
    status?: ResourceStatus;
    notes?: string;
}
