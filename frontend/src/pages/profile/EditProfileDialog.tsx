import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/responsive-dialog";
import { useUpdateProfile } from "@/hooks/useAuth";
import { editProfileSchema, type EditProfileFormValues } from "@/schemas/profile.schema";
import type { UserMe } from "@/types/auth";

interface Props {
  open: boolean;
  user: UserMe;
  onClose: () => void;
}

export const EditProfileDialog = ({ open, user, onClose }: Props) => {
  const form = useForm<EditProfileFormValues>({ resolver: zodResolver(editProfileSchema) });
  const { mutate: update, isPending } = useUpdateProfile();

  useEffect(() => {
    if (open) {
      form.reset({
        email: user.email ?? "",
        phone: user.phone ?? "",
        location: user.location ?? "",
      });
    }
  }, [open, user, form]);

  const onSubmit = (data: EditProfileFormValues) => {
    update(
      { email: data.email || undefined, phone: data.phone || undefined, location: data.location || undefined },
      { onSuccess: () => onClose() }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Email <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Input placeholder="you@example.com" {...form.register("email")} />
            {form.formState.errors.email && (
              <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Phone <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Input placeholder="0788xxxxxx" {...form.register("phone")} />
          </div>
          <div className="space-y-1.5">
            <Label>Location <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Input placeholder="City, district…" {...form.register("location")} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isPending}>{isPending ? "Saving…" : "Save Changes"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
