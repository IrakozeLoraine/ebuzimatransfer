import { ResourceStatus } from "@/types/resource";

export const STATUS_OPTIONS: ResourceStatus[] = ["AVAILABLE", "OCCUPIED", "RESERVED", "OUT_OF_SERVICE"];

export const STATUS_LABELS: Record<ResourceStatus, string> = {
    AVAILABLE: "Available",
    OCCUPIED: "Occupied",
    RESERVED: "Reserved",
    OUT_OF_SERVICE: "Out of Service",
};
