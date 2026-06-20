export const FACILITY_TYPES: { value: string; label: string }[] = [
  { value: "NRH_UTH", label: "National Referral and University Teaching Hospitals" },
  { value: "LEVEL_TWO", label: "Level Two Teaching Hospitals" },
  { value: "DISTRICT", label: "District Hospitals" },
  { value: "HEALTH_CENTER_POST", label: "Health Centers & Health Posts" },
];

export const TYPE_BADGES: Record<string, string> = {
  NRH_UTH: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  LEVEL_TWO: "bg-violet-50 text-violet-700 ring-1 ring-violet-200",
  DISTRICT: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  HEALTH_CENTER_POST: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
};

export const facilityTypeLabel = (type: string) =>
  FACILITY_TYPES.find((t) => t.value === type)?.label ?? type.replace(/_/g, " ");
