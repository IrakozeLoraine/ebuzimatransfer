import { getAuditLogs } from "@/api/audit.api";
import { useQuery } from "@tanstack/react-query";

export const useGetAllAuditLogs = () => useQuery({
    queryKey: ["audit-logs"],
    queryFn: () => getAuditLogs(),
});