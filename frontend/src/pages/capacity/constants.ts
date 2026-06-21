import { ResourceStatus } from "@/types/resource";

export const STATUS_OPTIONS: ResourceStatus[] = ["AVAILABLE", "OCCUPIED", "RESERVED", "OUT_OF_SERVICE"];

export const STATUS_LABELS: Record<ResourceStatus, string> = {
    AVAILABLE: "Available",
    OCCUPIED: "Occupied",
    RESERVED: "Reserved",
    OUT_OF_SERVICE: "Out of Service",
};

export const ROW_ACCENT: Record<ResourceStatus, string> = {
    AVAILABLE: "border-l-2 border-l-emerald-400",
    RESERVED: "border-l-2 border-l-amber-400",
    OCCUPIED: "border-l-2 border-l-rose-400",
    OUT_OF_SERVICE: "border-l-2 border-l-gray-300",
};
