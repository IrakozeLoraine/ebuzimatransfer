import { useQuery } from "@tanstack/react-query";
import { getAuditLogs } from "@/api/audit.api";
import { DataTable } from "@/components/organisms/DataTable";
import { formatDateTime } from "@/utils/format";
import { cn } from "@/utils/cn";
import { AuditLog } from "@/types/audit";

const ACTION_COLORS: Record<string, string> = {
  CREATE: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  UPDATE: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  DELETE: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
  LOGIN:  "bg-teal-50 text-teal-700 ring-1 ring-teal-200",
  LOGOUT: "bg-gray-100 text-gray-600 ring-1 ring-gray-200",
};

const getActionColor = (action: string): string => {
  for (const [key, cls] of Object.entries(ACTION_COLORS)) {
    if (action.includes(key)) return cls;
  }
  return "bg-muted text-muted-foreground ring-1 ring-border";
};

export const AuditLogsPage = () => {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: () => getAuditLogs(),
  });

  const columns = [
    {
      header: "Action",
      accessor: (l: AuditLog) => (
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-semibold font-mono",
            getActionColor(l.action)
          )}
        >
          {l.action}
        </span>
      ),
    },
    {
      header: "Entity Type",
      accessor: (l: AuditLog) => (
        <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
          {l.entity_type}
        </span>
      ),
    },
    {
      header: "Entity ID",
      accessor: (l: AuditLog) =>
        l.entity_id ? (
          <span className="font-mono text-xs text-muted-foreground">
            {l.entity_id.slice(0, 8)}…
          </span>
        ) : (
          <span className="text-muted-foreground/40">—</span>
        ),
    },
    {
      header: "User",
      accessor: (l: AuditLog) =>
        l.user_id ? (
          <span className="font-mono text-xs text-muted-foreground">
            {l.user_id.slice(0, 8)}…
          </span>
        ) : (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
            System
          </span>
        ),
    },
    {
      header: "IP Address",
      accessor: (l: AuditLog) => (
        <span className="font-mono text-xs text-muted-foreground">
          {l.ip_address ?? "—"}
        </span>
      ),
    },
    {
      header: "Timestamp",
      accessor: (l: AuditLog) => (
        <span className="text-xs text-muted-foreground">{formatDateTime(l.created_at)}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Audit Logs</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Complete record of system activity
        </p>
      </div>
      <DataTable
        columns={columns}
        data={logs}
        isLoading={isLoading}
        keyExtractor={(l) => l.id}
        emptyMessage="No audit logs found"
      />
    </div>
  );
};
