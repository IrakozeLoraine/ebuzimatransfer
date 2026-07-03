import { useQuery } from "@tanstack/react-query";
import {
  getProvinces,
  getDistricts,
  getSectors,
  getCells,
  getVillages,
} from "@/api/locations.api";

export const useProvinces = () =>
  useQuery({ queryKey: ["locations", "provinces"], queryFn: getProvinces, staleTime: Infinity });

export const useDistricts = (province: string | null) =>
  useQuery({
    queryKey: ["locations", "districts", province],
    queryFn: () => getDistricts(province!),
    enabled: !!province,
    staleTime: Infinity,
  });

export const useSectors = (province: string | null, district: string | null) =>
  useQuery({
    queryKey: ["locations", "sectors", province, district],
    queryFn: () => getSectors(province!, district!),
    enabled: !!province && !!district,
    staleTime: Infinity,
  });

export const useCells = (province: string | null, district: string | null, sector: string | null) =>
  useQuery({
    queryKey: ["locations", "cells", province, district, sector],
    queryFn: () => getCells(province!, district!, sector!),
    enabled: !!province && !!district && !!sector,
    staleTime: Infinity,
  });

export const useVillages = (
  province: string | null,
  district: string | null,
  sector: string | null,
  cell: string | null
) =>
  useQuery({
    queryKey: ["locations", "villages", province, district, sector, cell],
    queryFn: () => getVillages(province!, district!, sector!, cell!),
    enabled: !!province && !!district && !!sector && !!cell,
    staleTime: Infinity,
  });
