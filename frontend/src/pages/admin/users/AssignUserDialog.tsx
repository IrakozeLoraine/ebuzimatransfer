import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { assignUserToFacility } from "@/api/users.api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { assignUserSchema, type AssignUserFormValues } from "@/schemas/user.schema";
import { toast } from "@/components/ui/toaster";
import { getApiErrorMessage } from "@/utils/apiError";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const AssignUserDialog = ({ open, onOpenChange }: Props) => {
  const qc = useQueryClient();
  const form = useForm<AssignUserFormValues>({ resolver: zodResolver(assignUserSchema) });

  const { mutate: assign, isPending: assigning } = useMutation({
    mutationFn: (data: AssignUserFormValues) => assignUserToFacility({ medical_id: data.medical_id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
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

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) form.reset(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Assign User to Facility</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((d) => assign(d))} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Enter the Medical ID of a registered user to add them to your facility.
          </p>
          <div className="space-y-1.5">
            <Label>Medical ID</Label>
            <Input placeholder="e.g. RC-CHUK-001" {...form.register("medical_id")} />
            {form.formState.errors.medical_id && (
              <p className="text-xs text-destructive">{form.formState.errors.medical_id.message}</p>
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
