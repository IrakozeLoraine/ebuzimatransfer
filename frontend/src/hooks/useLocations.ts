import { useQuery } from "@tanstack/react-query";
import { getProvinces, getDistricts } from "@/api/locations.api";

export const useProvinces = () =>
  useQuery({ queryKey: ["locations", "provinces"], queryFn: getProvinces, staleTime: Infinity });

export const useDistricts = (province: string | null) =>
  useQuery({
    queryKey: ["locations", "districts", province],
    queryFn: () => getDistricts(province!),
    enabled: !!province,
    staleTime: Infinity,
  });
