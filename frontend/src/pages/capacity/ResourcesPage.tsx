import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useResources, useUpdateResourceStatus, useCreateResource } from "@/hooks/useResources";
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
import { Plus } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuthStore } from "@/store/auth.store";
import { resourceSchema, type ResourceFormValues } from "@/schemas/resource.schema";
import { cn } from "@/utils/cn";
import { Resource, RESOURCE_TYPES, ResourceStatus } from "@/types/resource";
import { ROW_ACCENT, STATUS_LABELS, STATUS_OPTIONS } from "./constants";
import { useGetAllUnits } from "@/hooks/useUnits";

export const ResourcesPage = () => {
  const { data: resources = [], isLoading } = useResources();
  const { mutate: updateStatus, isPending: updatingStatus } = useUpdateResourceStatus();
  const { mutate: createResource, isPending: creating } = useCreateResource();
  const [filter, setFilter] = useState<string>("ALL");
  const [showCreate, setShowCreate] = useState(false);

  const { isSuperAdmin, isFacilityAdmin } = usePermissions();
  const user = useAuthStore((s) => s.user);

  const { data: allUnits = [] } = useGetAllUnits({ enabled: showCreate});

  // FACILITY_ADMIN sees only their facilities' units; SUPER_ADMIN sees all
  const availableUnits = isSuperAdmin
    ? allUnits
    : allUnits.filter((u) => user?.facilities?.some((f) => f.id === u.facility_id));

  const form = useForm({ resolver: zodResolver(resourceSchema) });

  const onSubmit = (data: ResourceFormValues) => {
    createResource(
      {
        unit_id: data.unit_id,
        resource_name: data.resource_name,
        resource_code: data.resource_code,
        resource_type: data.resource_type as Resource["resource_type"] ?? undefined,
        quantity: data.quantity,
        notes: data.notes || undefined,
      },
      {
        onSuccess: () => {
          setShowCreate(false);
          form.reset();
        },
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
          <span className="font-mono text-xs text-muted-foreground">{r.resource_code}</span>
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
      header: "Status",
      accessor: (r: Resource) => <ResourceStatusBadge status={r.status} />,
    },
    {
      header: "Update Status",
      accessor: (r: Resource) => (
        <Select
          defaultValue={r.status}
          onValueChange={(v) => updateStatus({ id: r.id, status: v as ResourceStatus })}
          disabled={updatingStatus}
        >
          <SelectTrigger className="h-8 w-44 text-xs">
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
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Resource Management</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {resources.length} resources across all units
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Resources ({resources.length})</SelectItem>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABELS[s]} ({counts[s] ?? 0})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(isSuperAdmin || isFacilityAdmin) && (
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Resource
            </Button>
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

      <Dialog open={showCreate} onOpenChange={(o) => { setShowCreate(o); if (!o) form.reset(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Resource</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            <div className="space-y-1.5">
              <Label>Unit</Label>
              <Select onValueChange={(v) => form.setValue("unit_id", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a unit" />
                </SelectTrigger>
                <SelectContent>
                  {availableUnits.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name} ({u.type})
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
              <Label>Resource Code</Label>
              <Input placeholder="e.g. CHUK-ICU-MV-01" {...form.register("resource_code")} />
              {form.formState.errors.resource_code && (
                <p className="text-xs text-destructive">{form.formState.errors.resource_code.message}</p>
              )}
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
    </div>
  );
};
