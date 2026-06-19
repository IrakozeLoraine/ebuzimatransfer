import { useMemo, useState } from "react";
import { useFacilities, useCreateFacility, useUpdateFacility, useDeleteFacility } from "@/hooks/useFacilities";
import { useProvinces, useDistricts } from "@/hooks/useLocations";
import { DataTable } from "@/components/organisms/DataTable";
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
import { ConfirmDialog } from "@/components/molecules/ConfirmDialog";
import { TableToolbar, ALL_FILTER } from "@/components/molecules/TableToolbar";
import { Plus, Trash2, Pencil, Eye } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Facility } from "@/types/facility";
import { facilitySchema, type FacilityFormValues } from "@/schemas/facility.schema";

const FACILITY_TYPES: { value: string; label: string }[] = [
  { value: "NRH_UTH", label: "National Referral and University Teaching Hospitals" },
  { value: "LEVEL_TWO", label: "Level Two Teaching Hospitals" },
  { value: "DISTRICT", label: "District Hospitals" },
  { value: "HEALTH_CENTER_POST", label: "Health Centers & Health Posts" },
];

const TYPE_BADGES: Record<string, string> = {
  NRH_UTH: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  LEVEL_TWO: "bg-violet-50 text-violet-700 ring-1 ring-violet-200",
  DISTRICT: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  HEALTH_CENTER_POST: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
};

export const FacilitiesPage = () => {
  const { data: facilities = [], isLoading } = useFacilities();
  const { mutate: create, isPending: creating } = useCreateFacility();
  const { mutate: update, isPending: updating } = useUpdateFacility();
  const { mutate: deleteFac } = useDeleteFacility();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Facility | null>(null);
  const [toView, setToView] = useState<Facility | null>(null);
  const [toDelete, setToDelete] = useState<Facility | null>(null);
  const [selectedProvince, setSelectedProvince] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState(ALL_FILTER);
  const [statusFilter, setStatusFilter] = useState(ALL_FILTER);

  const { data: provinces = [] } = useProvinces();
  const { data: districts = [] } = useDistricts(selectedProvince);

  const filteredFacilities = useMemo(() => {
    const q = search.trim().toLowerCase();
    return facilities.filter((f) => {
      const matchesSearch =
        !q ||
        f.name.toLowerCase().includes(q) ||
        (f.location?.toLowerCase().includes(q) ?? false) ||
        (f.district?.toLowerCase().includes(q) ?? false) ||
        (f.province?.toLowerCase().includes(q) ?? false);
      const matchesType = typeFilter === ALL_FILTER || f.type === typeFilter;
      const matchesStatus =
        statusFilter === ALL_FILTER ||
        (statusFilter === "active" ? f.is_active : !f.is_active);
      return matchesSearch && matchesType && matchesStatus;
    });
  }, [facilities, search, typeFilter, statusFilter]);

  const resetFilters = () => {
    setSearch("");
    setTypeFilter(ALL_FILTER);
    setStatusFilter(ALL_FILTER);
  };

  const { register, handleSubmit, setValue, formState: { errors }, reset } =
    useForm<FacilityFormValues>({ resolver: zodResolver(facilitySchema) });

  const handleProvinceChange = (value: string) => {
    setValue("province", value);
    setValue("district", "");
    setSelectedProvince(value);
  };

  const handleClose = (open: boolean) => {
    setShowCreate(open);
    if (!open) {
      reset();
      setEditing(null);
      setSelectedProvince(null);
    }
  };

  const openEdit = (f: Facility) => {
    reset({
      name: f.name,
      type: f.type,
      location: f.location ?? "",
      province: f.province ?? "",
      district: f.district ?? "",
    });
    setSelectedProvince(f.province ?? null);
    setEditing(f);
    setShowCreate(true);
  };

  const onSubmit = (d: FacilityFormValues) => {
    if (editing) {
      update({ id: editing.id, payload: d }, { onSuccess: () => handleClose(false) });
    } else {
      create(d, { onSuccess: () => handleClose(false) });
    }
  };

  const columns = [
    {
      header: "Name",
      accessor: (f: Facility) => (
        <span className="font-medium">{f.name}</span>
      ),
    },
    {
      header: "Type",
      accessor: (f: Facility) => (
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium truncate ${TYPE_BADGES[f.type] ?? "bg-muted text-muted-foreground"
            }`}
        >
          {FACILITY_TYPES.find((t) => t.value === f.type)?.label ?? f.type.replace(/_/g, " ")}
        </span>
      ),
    },
    {
      header: "Province",
      accessor: (f: Facility) => (
        <span className="text-sm text-muted-foreground">{f.province ?? "—"}</span>
      ),
    },
    {
      header: "District",
      accessor: (f: Facility) => (
        <span className="text-sm text-muted-foreground">{f.district ?? "—"}</span>
      ),
    },
    {
      header: "Status",
      accessor: (f: Facility) => (
        <span
          className={`text-xs font-medium ${f.is_active ? "text-emerald-600" : "text-muted-foreground"
            }`}
        >
          {f.is_active ? "Active" : "Inactive"}
        </span>
      ),
    },
    {
      header: "",
      accessor: (f: Facility) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => setToView(f)}
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => openEdit(f)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={() => setToDelete(f)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Facility Management</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {facilities.filter((f) => f.is_active).length} active facilities
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Facility
        </Button>
      </div>

      <TableToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name, location, district, or province…"
        onReset={resetFilters}
        filters={[
          {
            key: "type",
            value: typeFilter,
            onChange: setTypeFilter,
            allLabel: "All types",
            options: FACILITY_TYPES.map((t) => ({ value: t.value, label: t.label })),
          },
          {
            key: "status",
            value: statusFilter,
            onChange: setStatusFilter,
            allLabel: "All statuses",
            className: "sm:w-40",
            options: [
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ],
          },
        ]}
      />

      <DataTable
        columns={columns}
        data={filteredFacilities}
        isLoading={isLoading}
        keyExtractor={(f) => f.id}
        emptyMessage="No facilities match your filters"
        pageSize={10}
      />

      <Dialog open={showCreate} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Facility" : "Add Facility"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
            <div className="space-y-1.5">
              <Label>Facility Name <span className="text-destructive">*</span></Label>
              <Input placeholder="e.g. CHUK" {...register("name")} />
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Type <span className="text-destructive">*</span></Label>
              <Select defaultValue={editing?.type} onValueChange={(v) => setValue("type", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {FACILITY_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.type && (
                <p className="text-xs text-destructive">{errors.type.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Location</Label>
              <Input placeholder="e.g. Kigali" {...register("location")} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Province</Label>
                <Select defaultValue={editing?.province ?? undefined} onValueChange={handleProvinceChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select province" />
                  </SelectTrigger>
                  <SelectContent>
                    {provinces.map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>District</Label>
                <Select
                  defaultValue={editing?.district ?? undefined}
                  onValueChange={(v) => setValue("district", v)}
                  disabled={!selectedProvince}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={selectedProvince ? "Select district" : "Select province first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {districts.map((d) => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleClose(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={creating || updating}>
                {creating || updating
                  ? "Saving…"
                  : editing
                    ? "Save Changes"
                    : "Add Facility"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!toView} onOpenChange={(open) => !open && setToView(null)}>
        <DialogContent className="sm:max-w-md bg-white dark:bg-slate-900">
          <DialogHeader>
            <DialogTitle>Facility Details</DialogTitle>
          </DialogHeader>
          {toView && (
            <dl className="space-y-4 text-sm">
              <div>
                <dt className="text-muted-foreground">Name</dt>
                <dd className="font-medium">{toView.name}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Type</dt>
                <dd className="mt-1">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${TYPE_BADGES[toView.type] ?? "bg-muted text-muted-foreground"
                      }`}
                  >
                    {FACILITY_TYPES.find((t) => t.value === toView.type)?.label ??
                      toView.type.replace(/_/g, " ")}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Province</dt>
                <dd className="font-medium">{toView.province ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">District</dt>
                <dd className="font-medium">{toView.district ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Location</dt>
                <dd className="font-medium">{toView.location ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Status</dt>
                <dd
                  className={`font-medium ${toView.is_active ? "text-emerald-600" : "text-muted-foreground"
                    }`}
                >
                  {toView.is_active ? "Active" : "Inactive"}
                </dd>
              </div>
            </dl>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!toDelete}
        title="Deactivate Facility"
        description={`Deactivate ${toDelete?.name}? It will be hidden from capacity views.`}
        confirmLabel="Deactivate"
        destructive
        onConfirm={() =>
          toDelete && deleteFac(toDelete.id, { onSuccess: () => setToDelete(null) })
        }
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
};
