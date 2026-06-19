import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { User } from "@/types/user";
import { formatDate } from "@/utils/format";
import { getRoleColor, ACCOUNT_STATUS_LABELS } from "./constants";

interface Props {
  user: User | null;
  onClose: () => void;
}

export const UserDetailsDialog = ({ user, onClose }: Props) => (
  <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>User Details</DialogTitle>
      </DialogHeader>
      {user && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full font-bold text-primary border border-r-0 border-primary">
              {user.first_name[0]}{user.last_name[0]}
            </div>
            <div>
              <p className="font-semibold">{user.first_name} {user.last_name}</p>
              <p className="text-xs text-muted-foreground">{user.medical_id}</p>
            </div>
          </div>
          <dl className="grid grid-cols-1 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Email</dt>
              <dd className="font-medium break-all">{user.email}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Phone</dt>
              <dd className="font-medium">{user.phone ?? "—"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">Roles</dt>
              <dd className="mt-1 flex flex-wrap gap-1.5">
                {user.roles.map((r) => (
                  <span key={r.id} className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${getRoleColor(r.name)}`}>
                    {r.name.replace(/_/g, " ")}
                  </span>
                ))}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">Facilities</dt>
              <dd className="font-medium">
                {user.facilities.length > 0 ? user.facilities.map((f) => f.name).join(", ") : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Status</dt>
              <dd className="font-medium">{ACCOUNT_STATUS_LABELS[user.account_status] ?? user.account_status}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Created</dt>
              <dd className="font-medium">{formatDate(user.created_at)}</dd>
            </div>
          </dl>
        </div>
      )}
    </DialogContent>
  </Dialog>
);
