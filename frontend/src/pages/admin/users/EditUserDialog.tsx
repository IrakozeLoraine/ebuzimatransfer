import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { User } from "@/types/user";
import { editUserSchema, type EditUserFormValues } from "@/schemas/user.schema";
import { SUPER_ADMIN_ROLES, getRoleColor } from "./constants";
import { useUpdateUser } from "@/hooks/useUser";

interface Props {
  user: User | null;
  onClose: () => void;
}

export const EditUserDialog = ({ user, onClose }: Props) => {
  const form = useForm<EditUserFormValues>({ resolver: zodResolver(editUserSchema) });

  useEffect(() => {
    if (user) {
      form.reset({
        first_name: user.first_name,
        last_name: user.last_name,
        phone: user.phone ?? "",
        email: user.email ?? "",
        roles: user.roles.map((r) => r.name),
      });
    }
  }, [user, form]);

  const { mutate: update, isPending: updating } = useUpdateUser({ onClose });

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit User</DialogTitle>
        </DialogHeader>
        {user && (
          <form
            onSubmit={form.handleSubmit((d) => update({ id: user.id, data: d }))}
            className="space-y-3"
          >
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
              <Label>Phone <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input placeholder="0788xxxxxx" {...form.register("phone")} />
            </div>
            <div className="space-y-1.5">
              <Label>Email <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input placeholder="user@example.com" {...form.register("email")} />
            </div>
            <div className="space-y-1.5">
              <Label>Roles</Label>
              <div className="flex flex-wrap gap-1.5">
                {SUPER_ADMIN_ROLES.map((r) => {
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
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={updating}>{updating ? "Saving…" : "Save Changes"}</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};
