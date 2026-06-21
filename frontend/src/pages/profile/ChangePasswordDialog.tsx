import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useChangePassword } from "@/hooks/useAuth";
import { changePasswordSchema, type ChangePasswordFormValues } from "@/schemas/profile.schema";
import { PasswordInput } from "@/components/atoms/PasswordInput";

interface Props {
  open: boolean;
  onClose: () => void;
}

export const ChangePasswordDialog = ({ open, onClose }: Props) => {
  const form = useForm<ChangePasswordFormValues>({ resolver: zodResolver(changePasswordSchema) });
  const { mutate: change, isPending } = useChangePassword();

  useEffect(() => {
    if (open) form.reset({ current_password: "", new_password: "", confirm_password: "" });
  }, [open, form]);

  const onSubmit = (data: ChangePasswordFormValues) => {
    change(
      { currentPassword: data.current_password, newPassword: data.new_password },
      { onSuccess: () => onClose() }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change Password</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Current Password</Label>
            <PasswordInput
              id="current_password"
              placeholder="••••••••"
              autoComplete="current-password"
              autoFocus
              {...form.register("current_password")}
            />
            {form.formState.errors.current_password && (
              <p className="text-xs text-destructive">{form.formState.errors.current_password.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>New Password</Label>
            <PasswordInput
              id="new_password"
              placeholder="••••••••"
              autoComplete="new-password"
              {...form.register("new_password")}
            />
            {form.formState.errors.new_password && (
              <p className="text-xs text-destructive">{form.formState.errors.new_password.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Confirm New Password</Label>
            <PasswordInput
              id="confirm_password"
              placeholder="••••••••"
              autoComplete="new-password"
              {...form.register("confirm_password")}
            />
            {form.formState.errors.confirm_password && (
              <p className="text-xs text-destructive">{form.formState.errors.confirm_password.message}</p>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isPending}>{isPending ? "Updating…" : "Update Password"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
