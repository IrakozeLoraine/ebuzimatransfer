import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  useResources,
  useUpdateResourceStatus} from "@/hooks/useResources";
import { DataTable } from "@/components/organisms/DataTable";
import { ResourceStatusBadge } from "@/components/atoms/ResourceStatusBadge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Upload, ArrowLeftRight, History } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/utils/cn";
import { Resource, ResourceStatus, ResourceFilters } from "@/types/resource";
import { STATUS_LABELS, STATUS_OPTIONS } from "./constants";
import UsageDialog from "./UsageDialog";
import AssignDialog from "./AssignDialog";
import ImportDialog from "./ImportDialog";
import AddResourceDialog from "./AddResourceDialog";

export const ResourcesPage = () => {
  const { isSuperAdmin, isFacilityAdmin, canManageResources, canAssignResources, canUpdateResourceStatus } = usePermissions();

  const [searchParams] = useSearchParams();
  const initialStatus = searchParams.get("status");
  const [scope, setScope] = useState<"ALL" | "UNASSIGNED">("ALL");
  const [filter, setFilter] = useState<string>(
    initialStatus && STATUS_OPTIONS.includes(initialStatus as ResourceStatus) ? initialStatus : "ALL"
  );
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [assignTargets, setAssignTargets] = useState<Resource[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [usageId, setUsageId] = useState<string | null>(null);

  // Super admin can switch between all resources and unassigned central stock.
  const queryFilters: ResourceFilters = isSuperAdmin && scope === "UNASSIGNED" ? { unassigned: true } : {};
  const { data: resources = [], isLoading } = useResources(queryFilters);
  const { mutate: updateStatus, isPending: updatingStatus } = useUpdateResourceStatus();

  const filtered = filter === "ALL" ? resources : resources.filter((r) => r.status === filter);

  const selectedResources = filtered.filter((r) => selectedIds.has(r.id));

  const toggleRow = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = (ids: string[]) =>
    setSelectedIds((prev) => {
      const allSelected = ids.every((id) => prev.has(id));
      const next = new Set(prev);
      for (const id of ids) {
        if (allSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });

  // Clearing on close also resets the multi-select after a bulk transfer.
  const closeAssign = () => {
    setAssignTargets([]);
    setSelectedIds(new Set());
  };

  const counts = STATUS_OPTIONS.reduce(
    (acc, s) => ({ ...acc, [s]: resources.filter((r) => r.status === s).length }),
    {} as Record<ResourceStatus, number>
  );

  const columns = [
    {
      header: "Resource",
      accessor: (r: Resource) => (
        <div className={cn("flex flex-col gap-0.5 -ml-4 pl-4")}>
          <span className="font-semibold text-foreground">{r.resource_name}</span>
          <span className="font-mono text-xs text-muted-foreground">{r.resource_code ?? "—"}</span>
        </div>
      ),
    },
    {
      header: "Type",
      accessor: (r: Resource) => (
        <span className="text-xs text-muted-foreground">{r.resource_type ?? "—"}</span>
      ),
    },
    {
      header: "Qty",
      accessor: (r: Resource) => (
        <span className="tabular-nums text-sm font-medium">{r.quantity}</span>
      ),
    },
    {
      header: "Assignment",
      accessor: (r: Resource) =>
        r.facility_id ? (
          <div className="flex flex-col gap-0.5">
            <span className="text-sm">{r.facility_name ?? "—"}</span>
            {r.unit_name && <span className="text-xs text-muted-foreground">{r.unit_name}</span>}
          </div>
        ) : (
          <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
            Unassigned
          </span>
        ),
    },
    {
      header: "Status",
      accessor: (r: Resource) => <ResourceStatusBadge status={r.status} />,
    },
    {
      header: "Update Status",
      accessor: (r: Resource) => (
        <Select
          defaultValue={r.status}
          onValueChange={(v) => updateStatus({ id: r.id, status: v as ResourceStatus })}
          disabled={updatingStatus || !r.facility_id || !canUpdateResourceStatus}
        >
          <SelectTrigger className="h-8 w-40 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s} className="text-xs">
                {STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
    },
    {
      header: "Actions",
      accessor: (r: Resource) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => setUsageId(r.id)}>
            <History className="h-3.5 w-3.5 mr-1" /> Usage
          </Button>
          {canAssignResources && (
            <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => setAssignTargets([r])}>
              <ArrowLeftRight className="h-3.5 w-3.5 mr-1" />
              {r.facility_id ? "Transfer" : "Assign"}
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Resource Management</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {resources.length} resources{isSuperAdmin && scope === "UNASSIGNED" ? " in central stock" : ""}
          </p>
        </div>
        <div className="flex flex-wrap justify-center md:justify-start gap-2">
          {isSuperAdmin && (
            <Select value={scope} onValueChange={(v) => setScope(v as "ALL" | "UNASSIGNED")}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Resources</SelectItem>
                <SelectItem value="UNASSIGNED">Unassigned Stock</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Statuses ({resources.length})</SelectItem>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABELS[s]} ({counts[s] ?? 0})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canManageResources && (
            <>
              <Button variant="outline" onClick={() => setShowImport(true)}>
                <Upload className="mr-2 h-4 w-4" />
                Import
              </Button>
              <Button onClick={() => setShowCreate(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Resource
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Bulk-selection action bar */}
      {canAssignResources && selectedResources.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm font-medium">
            {selectedResources.length} resource{selectedResources.length === 1 ? "" : "s"} selected
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
              Clear
            </Button>
            <Button size="sm" onClick={() => setAssignTargets(selectedResources)}>
              <ArrowLeftRight className="mr-1.5 h-3.5 w-3.5" />
              {isSuperAdmin ? "Transfer" : "Move to unit"}
            </Button>
          </div>
        </div>
      )}

      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        keyExtractor={(r) => r.id}
        emptyMessage="No resources match the selected filter"
        selection={
          canAssignResources
            ? { selectedIds, onToggle: toggleRow, onToggleAll: toggleAll }
            : undefined
        }
      />

      {/* Add resource */}
      <AddResourceDialog open={showCreate} onOpenChange={setShowCreate} />

      <ImportDialog open={showImport} onOpenChange={setShowImport} facilityScoped={isFacilityAdmin && !isSuperAdmin} />
      <AssignDialog resources={assignTargets} onClose={closeAssign} />
      <UsageDialog resourceId={usageId} onClose={() => setUsageId(null)} />
    </div>
  );
};
