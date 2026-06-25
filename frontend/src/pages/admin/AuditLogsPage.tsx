import { useMemo, useState } from "react";
import { DataTable } from "@/components/organisms/DataTable";
import { TableToolbar, ALL_FILTER } from "@/components/molecules/TableToolbar";
import { formatDateTime } from "@/utils/format";
import { cn } from "@/utils/cn";
import { usePermissions } from "@/hooks/usePermissions";
import { AuditLog } from "@/types/audit";
import { useGetAllAuditLogs } from "@/hooks/useAuditLogs";

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
  const { isSuperAdmin } = usePermissions();
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState(ALL_FILTER);
  const [entityTypeFilter, setEntityTypeFilter] = useState(ALL_FILTER);

  const { data: logs = [], isLoading } = useGetAllAuditLogs()

  const actionOptions = useMemo(
    () =>
      Array.from(new Set(logs.map((l) => l.action)))
        .sort()
        .map((a) => ({ value: a, label: a.replace(/_/g, " ") })),
    [logs]
  );

  const entityTypeOptions = useMemo(
    () =>
      Array.from(new Set(logs.map((l) => l.entity_type)))
        .sort()
        .map((t) => ({ value: t, label: t.replace(/_/g, " ") })),
    [logs]
  );

  const filteredLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((l) => {
      const matchesSearch =
        !q ||
        (l.entity?.toLowerCase().includes(q) ?? false) ||
        (l.user?.name.toLowerCase().includes(q) ?? false) ||
        (l.user?.email.toLowerCase().includes(q) ?? false) ||
        (l.ip_address?.toLowerCase().includes(q) ?? false);
      const matchesAction = actionFilter === ALL_FILTER || l.action === actionFilter;
      const matchesEntityType =
        entityTypeFilter === ALL_FILTER || l.entity_type === entityTypeFilter;
      return matchesSearch && matchesAction && matchesEntityType;
    });
  }, [logs, search, actionFilter, entityTypeFilter]);

  const resetFilters = () => {
    setSearch("");
    setActionFilter(ALL_FILTER);
    setEntityTypeFilter(ALL_FILTER);
  };

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
          {l.action?.replace(/_/g, " ")}
        </span>
      ),
    },
    {
      header: "Entity Type",
      accessor: (l: AuditLog) => (
        <span className="rounded-md bg-muted px-2 py-0.5 text-xs uppercase font-medium">
          {l.entity_type?.replace(/_/g, " ")}
        </span>
      ),
    },
    {
      header: "Entity",
      accessor: (l: AuditLog) =>
        l.entity ? (
          <span className="text-xs">{l.entity}</span>
        ) : (
          <span className="text-muted-foreground/40">—</span>
        ),
    },
    {
      header: "User",
      accessor: (l: AuditLog) =>
        l.user ? (
          <div className="flex flex-col">
            <span className="text-xs font-medium">{l.user.name}</span>
            <span className="text-xs text-muted-foreground">{l.user.email}</span>
          </div>
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
          {isSuperAdmin ? "Complete record of system activity" : "Activity at your facility"}
        </p>
      </div>

      <TableToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by entity, user, or IP address…"
        onReset={resetFilters}
        filters={[
          {
            key: "action",
            value: actionFilter,
            onChange: setActionFilter,
            allLabel: "All actions",
            options: actionOptions,
          },
          {
            key: "entity-type",
            value: entityTypeFilter,
            onChange: setEntityTypeFilter,
            allLabel: "All entities",
            options: entityTypeOptions,
          },
        ]}
      />

      <DataTable
        columns={columns}
        data={filteredLogs}
        isLoading={isLoading}
        keyExtractor={(l) => l.id}
        emptyMessage="No audit logs match your filters"
        pageSize={10}
        exportable={{
          filename: "audit-logs",
          columns: [
            { header: "Action", value: (l) => l.action?.replace(/_/g, " ") },
            { header: "Entity Type", value: (l) => l.entity_type?.replace(/_/g, " ") },
            { header: "Entity", value: (l) => l.entity ?? "" },
            { header: "User", value: (l) => l.user?.name ?? "System" },
            { header: "User Email", value: (l) => l.user?.email ?? "" },
            { header: "IP Address", value: (l) => l.ip_address ?? "" },
            { header: "Timestamp", value: (l) => formatDateTime(l.created_at) },
          ],
        }}
      />
    </div>
  );
};
