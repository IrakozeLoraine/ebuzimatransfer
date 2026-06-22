import { useEffect } from "react";
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
import { useFacilities } from "@/hooks/useFacilities";
import { createAssignSchema, type CreateAssignFormValues } from "@/schemas/user.schema";
import { FACILITY_ASSIGNABLE_ROLES, getRoleColor } from "./constants";
import { useCreateAndAssignUser } from "@/hooks/useUser";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isSuperAdmin?: boolean;
  /** When set, the new user is created and assigned to this facility (no picker). */
  fixedFacility?: { id: string; name: string } | null;
  /** Prefill from the failed assignment attempt. */
  initialMedicalId?: string;
  initialRoles?: string[];
}

export const CreateAssignUserDialog = ({
  open,
  onOpenChange,
  isSuperAdmin = false,
  fixedFacility = null,
  initialMedicalId = "",
  initialRoles = [],
}: Props) => {
  const needsFacilityPicker = isSuperAdmin && !fixedFacility;
  const { data: facilities = [], isLoading: loadingFacilities } = useFacilities();
  const form = useForm<CreateAssignFormValues>({ resolver: zodResolver(createAssignSchema) });

  useEffect(() => {
    if (open) {
      form.reset({
        medical_id: initialMedicalId,
        roles: initialRoles,
        first_name: "",
        last_name: "",
        email: "",
        phone: "",
        facility_id: fixedFacility?.id,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const { mutate: create, isPending } = useCreateAndAssignUser({
    onSuccess: () => {
      onOpenChange(false);
      form.reset();
    },
    fixedFacility: fixedFacility
  });

  const onSubmit = (data: CreateAssignFormValues) => {
    if (needsFacilityPicker && !data.facility_id) {
      form.setError("facility_id", { message: "Select a facility" });
      return;
    }
    create(data);
  };

  const heading = fixedFacility ? `Create & assign to ${fixedFacility.name}` : "Create & assign user";

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) form.reset(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{heading}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>First Name</Label>
              <Input {...form.register("first_name")} />
              {form.formState.errors.first_name && (
                <p className="text-xs text-destructive">{form.formState.errors.first_name.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Last Name</Label>
              <Input {...form.register("last_name")} />
              {form.formState.errors.last_name && (
                <p className="text-xs text-destructive">{form.formState.errors.last_name.message}</p>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Medical ID</Label>
            <Input placeholder="e.g. RC-CHUK-001" {...form.register("medical_id")} />
            {form.formState.errors.medical_id && (
              <p className="text-xs text-destructive">{form.formState.errors.medical_id.message}</p>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Phone <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input placeholder="0788xxxxxx" {...form.register("phone")} />
            </div>
            <div className="space-y-1.5">
              <Label>Email <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input type="email" {...form.register("email")} />
              {form.formState.errors.email && (
                <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
              )}
            </div>
          </div>

          {needsFacilityPicker && (
            <div className="space-y-1.5">
              <Label>Facility</Label>
              <Select
                value={form.watch("facility_id") ?? ""}
                onValueChange={(v) => form.setValue("facility_id", v, { shouldValidate: true })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={loadingFacilities ? "Loading…" : "Select a facility"} />
                </SelectTrigger>
                <SelectContent>
                  {facilities.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.facility_id && (
                <p className="text-xs text-destructive">{form.formState.errors.facility_id.message}</p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Roles at this facility</Label>
            <div className="flex flex-wrap gap-1.5">
              {FACILITY_ASSIGNABLE_ROLES.map((r) => {
                const selected = (form.watch("roles") ?? []).includes(r);
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      const current = form.getValues("roles") ?? [];
                      form.setValue(
                        "roles",
                        selected ? current.filter((x) => x !== r) : [...current, r],
                        { shouldValidate: true }
                      );
                    }}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition-all ${selected
                      ? getRoleColor(r)
                      : "bg-muted text-muted-foreground ring-1 ring-transparent hover:ring-border"
                      }`}
                  >
                    {r.replace(/_/g, " ")}
                  </button>
                );
              })}
            </div>
            {form.formState.errors.roles && (
              <p className="text-xs text-destructive">{form.formState.errors.roles.message}</p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isPending}>{isPending ? "Creating…" : "Create & Assign"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
