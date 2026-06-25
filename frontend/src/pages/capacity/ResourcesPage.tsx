import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useResources } from "@/hooks/useResources";
import { DataTable } from "@/components/organisms/DataTable";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Plus, Upload, ArrowLeftRight, History, Search, SlidersHorizontal, PlusCircle } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/utils/cn";
import { Resource, ResourceStatus, ResourceFilters } from "@/types/resource";
import { STATUS_LABELS, STATUS_OPTIONS } from "./constants";
import UsageDialog from "./UsageDialog";
import AssignDialog from "./AssignDialog";
import AdjustUnitsDialog from "./AdjustUnitsDialog";
import ImportDialog from "./ImportDialog";
import AddResourceDialog from "./AddResourceDialog";
import AvailabilityDialog from "./AvailabilityDialog";

/** Units of a resource group that fall into a given status bucket. */
const unitsInBucket = (r: Resource, status: ResourceStatus): number =>
  status === "AVAILABLE"
    ? r.available
    : status === "OCCUPIED"
    ? r.occupied
    : status === "RESERVED"
    ? r.reserved
    : r.out_of_service;

export const ResourcesPage = () => {
  const { isSuperAdmin, isFacilityAdmin, canManageResources, canAssignResources, canUpdateResourceStatus } = usePermissions();

  const [searchParams] = useSearchParams();
  const initialStatus = searchParams.get("status");
  const [scope, setScope] = useState<"ALL" | "UNASSIGNED">("ALL");
  const [filter, setFilter] = useState<string>(
    initialStatus && STATUS_OPTIONS.includes(initialStatus as ResourceStatus) ? initialStatus : "ALL"
  );
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [assignTargets, setAssignTargets] = useState<Resource[]>([]);
  const [addUnitsTarget, setAddUnitsTarget] = useState<Resource | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [usageId, setUsageId] = useState<string | null>(null);
  const [availabilityTarget, setAvailabilityTarget] = useState<Resource | null>(null);

  // Super admin can switch between all resources and unassigned central stock.
  const queryFilters: ResourceFilters = isSuperAdmin && scope === "UNASSIGNED" ? { unassigned: true } : {};
  const { data: resources = [], isLoading } = useResources(queryFilters);

  const query = search.trim().toLowerCase();
  const filtered = resources
    .filter((r) => {
      const matchesStatus =
        filter === "ALL" || unitsInBucket(r, filter as ResourceStatus) > 0;
      const matchesSearch =
        !query ||
        r.resource_name.toLowerCase().includes(query) ||
        (r.resource_code ?? "").toLowerCase().includes(query) ||
        (r.resource_type ?? "").toLowerCase().includes(query) ||
        (r.facility_name ?? "").toLowerCase().includes(query) ||
        (r.unit_name ?? "").toLowerCase().includes(query);
      return matchesStatus && matchesSearch;
    })
    // Sort by assignment (facility, then unit), then resource name. Unassigned
    // central stock sorts last.
    .sort((a, b) => {
      const byFacility = (a.facility_name ?? "￿").localeCompare(b.facility_name ?? "￿");
      if (byFacility !== 0) return byFacility;
      const byUnit = (a.unit_name ?? "").localeCompare(b.unit_name ?? "");
      if (byUnit !== 0) return byUnit;
      return a.resource_name.localeCompare(b.resource_name);
    });

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

  // Totals shown in the filter dropdown are unit counts across all groups.
  const counts = STATUS_OPTIONS.reduce(
    (acc, s) => ({ ...acc, [s]: resources.reduce((sum, r) => sum + unitsInBucket(r, s), 0) }),
    {} as Record<ResourceStatus, number>
  );

  const columns = [
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
      header: "Resource",
      accessor: (r: Resource) => (
        <div className={cn("flex flex-col gap-0.5 -ml-4 pl-4")}>
          <span className="font-semibold text-foreground">{r.resource_name}</span>
          <span className="font-mono text-xs text-muted-foreground">{r.resource_code ?? "—"}</span>
        </div>
      ),
    },
    {
      header: "Qty",
      accessor: (r: Resource) => (
        <span className="tabular-nums text-sm font-medium">{r.quantity}</span>
      ),
    },
    {
      header: "Availability",
      accessor: (r: Resource) => (
        <div className="flex flex-col gap-1">
          <span className="text-sm">
            <span className="font-semibold text-emerald-600 tabular-nums">{r.available}</span>
            <span className="text-muted-foreground"> / {r.quantity} available</span>
          </span>
          <div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
            {r.occupied > 0 && (
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                {r.occupied} occ
              </span>
            )}
            {r.reserved > 0 && (
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                {r.reserved} res
              </span>
            )}
            {r.out_of_service > 0 && (
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                {r.out_of_service} oos
              </span>
            )}
          </div>
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
      header: "Actions",
      accessor: (r: Resource) => (
        <div className="flex items-center gap-1">
          {canUpdateResourceStatus && r.facility_id && (
            <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => setAvailabilityTarget(r)}>
              <SlidersHorizontal className="h-3.5 w-3.5 mr-1" /> Update
            </Button>
          )}
          <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => setUsageId(r.id)}>
            <History className="h-3.5 w-3.5 mr-1" /> Usage
          </Button>
          {canAssignResources && (
            <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => setAddUnitsTarget(r)}>
              <PlusCircle className="h-3.5 w-3.5 mr-1" /> Units
            </Button>
          )}
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

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
        <Input
          placeholder="Search by name, code, type, facility, or unit…"
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
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
        pageSize={10}
        exportable={{
          filename: "resources",
          columns: [
            { header: "Resource", value: (r) => r.resource_name },
            { header: "Code", value: (r) => r.resource_code ?? "" },
            { header: "Type", value: (r) => r.resource_type ?? "" },
            { header: "Quantity", value: (r) => r.quantity },
            { header: "Facility", value: (r) => r.facility_name ?? "Unassigned" },
            { header: "Unit", value: (r) => r.unit_name ?? "" },
            { header: "Available", value: (r) => r.available },
            { header: "Occupied", value: (r) => r.occupied },
            { header: "Reserved", value: (r) => r.reserved },
            { header: "Out of Service", value: (r) => r.out_of_service },
          ],
        }}
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
      <AdjustUnitsDialog resource={addUnitsTarget} onClose={() => setAddUnitsTarget(null)} />
      <UsageDialog resourceId={usageId} onClose={() => setUsageId(null)} />
      <AvailabilityDialog resource={availabilityTarget} onClose={() => setAvailabilityTarget(null)} />
    </div>
  );
};
