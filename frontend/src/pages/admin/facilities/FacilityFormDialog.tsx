import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/responsive-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateFacility, useUpdateFacility } from "@/hooks/useFacilities";
import { useProvinces, useDistricts } from "@/hooks/useLocations";
import type { Facility } from "@/types/facility";
import { facilitySchema, type FacilityFormValues } from "@/schemas/facility.schema";
import { FACILITY_TYPES } from "./constants";

interface Props {
  open: boolean;
  /** The facility being edited, or null to create a new one. */
  facility: Facility | null;
  onOpenChange: (open: boolean) => void;
}

export const FacilityFormDialog = ({ open, facility, onOpenChange }: Props) => {
  const { mutate: create, isPending: creating } = useCreateFacility();
  const { mutate: update, isPending: updating } = useUpdateFacility();
  const [selectedProvince, setSelectedProvince] = useState<string | null>(null);

  const { data: provinces = [] } = useProvinces();
  const { data: districts = [] } = useDistricts(selectedProvince);

  const { register, handleSubmit, setValue, watch, formState: { errors }, reset } =
    useForm<FacilityFormValues>({ resolver: zodResolver(facilitySchema) });

  useEffect(() => {
    if (open) {
      reset({
        name: facility?.name ?? "",
        type: facility?.type ?? "",
        location: facility?.location ?? "",
        province: facility?.province ?? "",
        district: facility?.district ?? "",
      });
      setSelectedProvince(facility?.province ?? null);
    }
  }, [open, facility, reset]);

  const close = () => onOpenChange(false);

  const handleProvinceChange = (value: string) => {
    setValue("province", value);
    setValue("district", "");
    setSelectedProvince(value);
  };

  const onSubmit = (d: FacilityFormValues) => {
    if (facility) {
      update({ id: facility.id, payload: d }, { onSuccess: close });
    } else {
      create(d, { onSuccess: close });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{facility ? "Edit Facility" : "Add Facility"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Facility Name <span className="text-destructive">*</span></Label>
            <Input placeholder="e.g. CHUK" {...register("name")} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Type <span className="text-destructive">*</span></Label>
            <Select value={watch("type") || undefined} onValueChange={(v) => setValue("type", v, { shouldValidate: true })}>
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {FACILITY_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.type && <p className="text-xs text-destructive">{errors.type.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Location</Label>
            <Input placeholder="e.g. Kigali" {...register("location")} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Province</Label>
              <Select value={watch("province") || undefined} onValueChange={handleProvinceChange}>
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
                value={watch("district") || undefined}
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
            <Button type="button" variant="outline" onClick={close}>Cancel</Button>
            <Button type="submit" disabled={creating || updating}>
              {creating || updating ? "Saving…" : facility ? "Save Changes" : "Add Facility"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
