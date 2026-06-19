import { useState } from "react";
import { useFacilities, useCreateFacility, useDeleteFacility } from "@/hooks/useFacilities";
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
import { Plus, Trash2, MapPin } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Facility } from "@/types/facility";
import { facilitySchema, type FacilityFormValues } from "@/schemas/facility.schema";

const FACILITY_TYPES: { value: string; label: string }[] = [
  { value: "NRH_UTH",            label: "National Referral and University Teaching Hospitals (NRH/UTH)" },
  { value: "LEVEL_TWO",          label: "Level Two Teaching Hospitals" },
  { value: "DISTRICT",           label: "District Hospitals" },
  { value: "HEALTH_CENTER_POST", label: "Health Centers & Health Posts" },
];

const TYPE_BADGES: Record<string, string> = {
  NRH_UTH:            "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
  LEVEL_TWO:          "bg-violet-50 text-violet-700 ring-1 ring-violet-200",
  DISTRICT:           "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  HEALTH_CENTER_POST: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
};

export const FacilitiesPage = () => {
  const { data: facilities = [], isLoading } = useFacilities();
  const { mutate: create, isPending: creating } = useCreateFacility();
  const { mutate: deleteFac } = useDeleteFacility();
  const [showCreate, setShowCreate] = useState(false);
  const [toDelete, setToDelete] = useState<Facility | null>(null);
  const [selectedProvince, setSelectedProvince] = useState<string | null>(null);

  const { data: provinces = [] } = useProvinces();
  const { data: districts = [] } = useDistricts(selectedProvince);

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
      setSelectedProvince(null);
    }
  };

  const columns = [
    {
      header: "Name",
      accessor: (f: Facility) => (
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <MapPin className="h-3.5 w-3.5 text-primary" />
          </div>
          <span className="font-semibold">{f.name}</span>
        </div>
      ),
    },
    {
      header: "Type",
      accessor: (f: Facility) => (
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            TYPE_BADGES[f.type] ?? "bg-muted text-muted-foreground"
          }`}
        >
          {FACILITY_TYPES.find((t) => t.value === f.type)?.label ?? f.type.replace(/_/g, " ")}
        </span>
      ),
    },
    {
      header: "Location",
      accessor: (f: Facility) => (
        <span className="text-sm text-muted-foreground">{f.location ?? "—"}</span>
      ),
    },
    {
      header: "Province",
      accessor: (f: Facility) => (
        <span className="text-sm text-muted-foreground">{f.province ?? "—"}</span>
      ),
    },
    {
      header: "Status",
      accessor: (f: Facility) => (
        <span
          className={`text-xs font-medium ${
            f.is_active ? "text-emerald-600" : "text-muted-foreground"
          }`}
        >
          {f.is_active ? "Active" : "Inactive"}
        </span>
      ),
    },
    {
      header: "",
      accessor: (f: Facility) => (
        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          onClick={() => setToDelete(f)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
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

      <DataTable
        columns={columns}
        data={facilities}
        isLoading={isLoading}
        keyExtractor={(f) => f.id}
        emptyMessage="No facilities found"
      />

      <Dialog open={showCreate} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Facility</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={handleSubmit((d) =>
              create(d, { onSuccess: () => handleClose(false) })
            )}
            className="space-y-3"
          >
            <div className="space-y-1.5">
              <Label>Facility Name <span className="text-destructive">*</span></Label>
              <Input placeholder="e.g. CHUK" {...register("name")} />
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Type <span className="text-destructive">*</span></Label>
              <Select onValueChange={(v) => setValue("type", v)}>
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
                <Select onValueChange={handleProvinceChange}>
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
              <Button type="submit" disabled={creating}>
                {creating ? "Saving…" : "Add Facility"}
              </Button>
            </div>
          </form>
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
