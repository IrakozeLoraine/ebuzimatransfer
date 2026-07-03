import { useQuery } from "@tanstack/react-query";
import { getInAppCalls, getInAppCallsLog } from "@/api/incall.api";

export const useInAppCalls = (referralId?: string) =>
  useQuery({
    queryKey: ["in-app-calls", referralId ?? "mine"],
    queryFn: () => getInAppCalls(referralId),
  });

export const useInAppCallsLog = (status?: string) =>
  useQuery({
    queryKey: ["in-app-calls", "log", status ?? "all"],
    queryFn: () => getInAppCallsLog(status),
  });
