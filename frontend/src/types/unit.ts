export interface Unit {
    id: string;
    name: string;
    type: "ICU" | "HDU";
    facility_id: string;
}

export interface CreateUnitPayload {
    name: string;
    type: "ICU" | "HDU";
    facility_id: string;
}

export interface UpdateUnitPayload {
    name?: string;
    type?: "ICU" | "HDU";
}