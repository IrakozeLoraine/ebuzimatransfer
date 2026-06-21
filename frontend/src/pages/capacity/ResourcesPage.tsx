import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  useResources,
  useUpdateResourceStatus,
  useCreateResource
} from "@/hooks/useResources";
import { DataTable } from "@/components/organisms/DataTable";
import { ResourceStatusBadge } from "@/components/atoms/ResourceStatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Upload, ArrowLeftRight, History } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuthStore } from "@/store/auth.store";
import { resourceSchema, type ResourceFormValues } from "@/schemas/resource.schema";
import { cn } from "@/utils/cn";
import { Resource, RESOURCE_TYPES, ResourceStatus, ResourceFilters } from "@/types/resource";
import { ROW_ACCENT, STATUS_LABELS, STATUS_OPTIONS } from "./constants";
import { useUnits } from "@/hooks/useUnits";
import { useFacilities } from "@/hooks/useFacilities";
import { toast } from "@/components/ui/toaster";
import { getApiErrorMessage } from "@/utils/apiError";
import UsageDialog from "./UsageDialog";
import AssignDialog from "./AssignDialog";
import ImportDialog from "./ImportDialog";

export const ResourcesPage = () => {
  const { isSuperAdmin, isFacilityAdmin, canManageResources, canAssignResources } = usePermissions();
  const user = useAuthStore((s) => s.user);

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
  const { mutate: createResource, isPending: creating } = useCreateResource();

  // A facility admin's resources live in their (active) facility; a super admin
  // picks a target facility in the create dialog. Units are derived from that
  // facility's tier (the cascading catalog) by the backend.
  const myFacilityId = user?.active_facility_id ?? user?.facilities?.[0]?.id ?? "";
  const [createFacilityId, setCreateFacilityId] = useState<string>("");
  const unitFacilityId = isSuperAdmin ? createFacilityId : myFacilityId;
  const { data: unitOptions = [] } = useUnits(
    { facility_id: unitFacilityId || undefined },
    { enabled: showCreate && !!unitFacilityId }
  );
  const { data: facilities = [] } = useFacilities();

  const form = useForm({ resolver: zodResolver(resourceSchema) });

  const onSubmit = (data: ResourceFormValues) => {
    createResource(
      {
        unit_id: data.unit_id || undefined,
        // Super admin targets a chosen facility (empty = central stock); a
        // facility admin's facility is resolved server-side.
        facility_id: isSuperAdmin ? (createFacilityId || undefined) : undefined,
        resource_name: data.resource_name,
        resource_code: data.resource_code,
        resource_type: data.resource_type as Resource["resource_type"] ?? undefined,
        quantity: data.quantity,
        notes: data.notes || undefined,
      },
      {
        onSuccess: () => {
          toast({ variant: "success", title: "Resource added" });
          setShowCreate(false);
          setCreateFacilityId("");
          form.reset();
        },
        onError: (e) => toast({ variant: "destructive", title: "Could not add resource", description: getApiErrorMessage(e) }),
      }
    );
  };

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Resource Management</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {resources.length} resources{isSuperAdmin && scope === "UNASSIGNED" ? " in central stock" : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
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
      <Dialog
        open={showCreate}
        onOpenChange={(o) => { setShowCreate(o); if (!o) { form.reset(); setCreateFacilityId(""); } }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Resource</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            {isSuperAdmin && (
              <div className="space-y-1.5">
                <Label>
                  Facility{" "}
                  <span className="text-muted-foreground text-xs">(optional — leave empty for central stock)</span>
                </Label>
                <Select
                  value={createFacilityId}
                  onValueChange={(v) => { setCreateFacilityId(v); form.setValue("unit_id", ""); }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Unassigned (central stock)" />
                  </SelectTrigger>
                  <SelectContent>
                    {facilities.map((f) => (
                      <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>
                Unit{" "}
                {isSuperAdmin && (
                  <span className="text-muted-foreground text-xs">(select a facility first)</span>
                )}
              </Label>
              <Select
                key={unitFacilityId}
                onValueChange={(v) => form.setValue("unit_id", v)}
                disabled={isSuperAdmin && !createFacilityId}
              >
                <SelectTrigger>
                  <SelectValue placeholder={isSuperAdmin && !createFacilityId ? "Select a facility first" : "Select a unit"} />
                </SelectTrigger>
                <SelectContent>
                  {unitOptions.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.unit_id && (
                <p className="text-xs text-destructive">{form.formState.errors.unit_id.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Resource Name</Label>
              <Input placeholder="e.g. Maquet Servo-i Invasive Ventilator" {...form.register("resource_name")} />
              {form.formState.errors.resource_name && (
                <p className="text-xs text-destructive">{form.formState.errors.resource_name.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Resource Code <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input placeholder="e.g. CHUK-ICU-MV-01" {...form.register("resource_code")} />
            </div>

            <div className="space-y-1.5">
              <Label>Resource Type <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Select onValueChange={(v) => form.setValue("resource_type", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a type" />
                </SelectTrigger>
                <SelectContent>
                  {RESOURCE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Quantity</Label>
              <Input type="number" min={1} defaultValue={1} {...form.register("quantity", { valueAsNumber: true })} />
              {form.formState.errors.quantity && (
                <p className="text-xs text-destructive">{form.formState.errors.quantity.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input placeholder="Additional details…" {...form.register("notes")} />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button type="submit" disabled={creating}>{creating ? "Adding…" : "Add Resource"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ImportDialog open={showImport} onOpenChange={setShowImport} facilityScoped={isFacilityAdmin && !isSuperAdmin} />
      <AssignDialog
        resource={assignTarget}
        onClose={() => setAssignTarget(null)}
      />
      <UsageDialog resourceId={usageId} onClose={() => setUsageId(null)} />
    </div>
  );
};
