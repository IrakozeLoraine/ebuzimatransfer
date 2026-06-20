import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { assignUserToFacility, assignUserToSpecificFacility } from "@/api/users.api";
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
import { assignUserSchema, type AssignUserFormValues } from "@/schemas/user.schema";
import { toast } from "@/components/ui/toaster";
import { getApiErrorMessage } from "@/utils/apiError";
import { useFacilities } from "@/hooks/useFacilities";
import { FACILITY_ASSIGNABLE_ROLES, getRoleColor } from "./constants";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Super admins choose a target facility; facility admins assign to their own. */
  isSuperAdmin?: boolean;
  /** When set, the user is fixed (user-details page) — no Medical ID field is shown. */
  fixedUser?: { id: string; medical_id: string } | null;
  /** When set, the facility is fixed (facility-details page) — no facility picker is shown. */
  fixedFacility?: { id: string; name: string } | null;
}

export const AssignUserDialog = ({
  open,
  onOpenChange,
  isSuperAdmin = false,
  fixedUser = null,
  fixedFacility = null,
}: Props) => {
  const qc = useQueryClient();
  const form = useForm<AssignUserFormValues>({ resolver: zodResolver(assignUserSchema) });
  // Only the super-admin facility picker needs the list; skip the query otherwise.
  const needsFacilityPicker = isSuperAdmin && !fixedFacility;
  const { data: facilities = [], isLoading: loadingFacilities } = useFacilities();

  const { mutate: assign, isPending: assigning } = useMutation({
    mutationFn: (data: AssignUserFormValues) => {
      const medical_id = fixedUser?.medical_id ?? (data.medical_id as string);
      const facilityId = fixedFacility?.id ?? data.facility_id;
      // A specific facility (fixed or picked by a super admin) → targeted endpoint;
      // otherwise a facility admin assigns within their own active facility.
      return facilityId
        ? assignUserToSpecificFacility(facilityId, { medical_id, roles: data.roles })
        : assignUserToFacility({ medical_id, roles: data.roles });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["user"] });
      qc.invalidateQueries({ queryKey: ["facility"] });
      toast({ variant: "success", title: "User assigned to facility" });
      onOpenChange(false);
      form.reset();
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Failed to assign user",
        description: getApiErrorMessage(error),
      });
    },
  });

  const onSubmit = (data: AssignUserFormValues) => {
    if (!fixedUser && (!data.medical_id || data.medical_id.trim().length < 3)) {
      form.setError("medical_id", { message: "Medical ID is required" });
      return;
    }
    if (needsFacilityPicker && !data.facility_id) {
      form.setError("facility_id", { message: "Select a facility" });
      return;
    }
    assign(data);
  };

  const title = fixedFacility
    ? `Assign User to ${fixedFacility.name}`
    : "Assign to Facility";

  const intro = fixedFacility
    ? "Enter the Medical ID of a registered user and the roles they will hold at this facility."
    : fixedUser
    ? needsFacilityPicker
      ? "Choose a facility and the roles this user will hold there."
      : "Select the roles this user will hold at your facility."
    : needsFacilityPicker
    ? "Enter the Medical ID of a registered user and choose the facility to add them to."
    : "Enter the Medical ID of a registered user to add them to your facility.";

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) form.reset(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <p className="text-sm text-muted-foreground">{intro}</p>

          {!fixedUser && (
            <div className="space-y-1.5">
              <Label>Medical ID</Label>
              <Input placeholder="e.g. RC-CHUK-001" {...form.register("medical_id")} />
              {form.formState.errors.medical_id && (
                <p className="text-xs text-destructive">{form.formState.errors.medical_id.message}</p>
              )}
            </div>
          )}

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
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
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
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition-all ${
                      selected
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
            <Button type="submit" disabled={assigning}>{assigning ? "Assigning…" : "Assign User"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
