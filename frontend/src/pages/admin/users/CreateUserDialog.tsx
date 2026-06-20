import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PasswordInput } from "@/components/atoms/PasswordInput";
import { userSchema, type UserFormValues } from "@/schemas/user.schema";
import { useCreateUser } from "@/hooks/useUser";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const CreateUserDialog = ({ open, onOpenChange }: Props) => {
  const form = useForm<UserFormValues>({ resolver: zodResolver(userSchema) });

  const { mutate: create, isPending: creating } = useCreateUser({ onClose: () => {
    onOpenChange(false);
    form.reset();
  }})

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) form.reset(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create New User</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((d) => create(d))} className="space-y-3">
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
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Medical ID</Label>
            <Input placeholder="e.g. RC-CHUK-001" {...form.register("medical_id")} />
            {form.formState.errors.medical_id && (
              <p className="text-xs text-destructive">{form.formState.errors.medical_id.message}</p>
            )}
            <div className="space-y-1.5">
              <Label>Phone <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input placeholder="0788xxxxxx" {...form.register("phone")} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Email <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Input type="email" {...form.register("email")} />
            {form.formState.errors.email && (
              <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Password</Label>
            <PasswordInput {...form.register("password")} />
            {form.formState.errors.password && (
              <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Roles are assigned per facility after the account is created, via “Assign to Facility”.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={creating}>{creating ? "Creating…" : "Create User"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
