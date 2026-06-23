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
import { ROW_ACCENT, STATUS_LABELS, STATUS_OPTIONS } from "./constants";
import UsageDialog from "./UsageDialog";
import AssignDialog from "./AssignDialog";
import ImportDialog from "./ImportDialog";
import AddResourceDialog from "./AddResourceDialog";

export const ResourcesPage = () => {
  const { isSuperAdmin, isFacilityAdmin, canManageResources, canAssignResources } = usePermissions();

  const [searchParams] = useSearchParams();
  const initialStatus = searchParams.get("status");
  const [scope, setScope] = useState<"ALL" | "UNASSIGNED">("ALL");
  const [filter, setFilter] = useState<string>(
    initialStatus && STATUS_OPTIONS.includes(initialStatus as ResourceStatus) ? initialStatus : "ALL"
  );
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [assignTarget, setAssignTarget] = useState<Resource | null>(null);
  const [usageId, setUsageId] = useState<string | null>(null);

  // Super admin can switch between all resources and unassigned central stock.
  const queryFilters: ResourceFilters = isSuperAdmin && scope === "UNASSIGNED" ? { unassigned: true } : {};
  const { data: resources = [], isLoading } = useResources(queryFilters);
  const { mutate: updateStatus, isPending: updatingStatus } = useUpdateResourceStatus();

  const filtered = filter === "ALL" ? resources : resources.filter((r) => r.status === filter);

  const counts = STATUS_OPTIONS.reduce(
    (acc, s) => ({ ...acc, [s]: resources.filter((r) => r.status === s).length }),
    {} as Record<ResourceStatus, number>
  );

  const columns = [
    {
      header: "Resource",
      accessor: (r: Resource) => (
        <div className={cn("flex flex-col gap-0.5 -ml-4 pl-4", ROW_ACCENT[r.status])}>
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
          disabled={updatingStatus || !r.facility_id}
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
            <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => setAssignTarget(r)}>
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

      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        keyExtractor={(r) => r.id}
        emptyMessage="No resources match the selected filter"
      />

      {/* Add resource */}
      <AddResourceDialog open={showCreate} onOpenChange={setShowCreate} />

      <ImportDialog open={showImport} onOpenChange={setShowImport} facilityScoped={isFacilityAdmin && !isSuperAdmin} />
      <AssignDialog
        resource={assignTarget}
        onClose={() => setAssignTarget(null)}
      />
      <UsageDialog resourceId={usageId} onClose={() => setUsageId(null)} />
    </div>
  );
};
