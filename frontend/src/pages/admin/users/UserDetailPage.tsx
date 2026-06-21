import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Pencil, UserPlus, Trash2, ChevronRight, X, KeyRound } from "lucide-react";
import { useUser, useRemoveUserFromFacility, useDeactivateUser, useUpdateUserAccountStatus } from "@/hooks/useUser";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuthStore } from "@/store/auth.store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/molecules/ConfirmDialog";
import { formatDate } from "@/utils/format";
import { EditUserDialog } from "./EditUserDialog";
import { AssignUserDialog } from "./AssignUserDialog";
import { getRoleColor, ACCOUNT_STATUS_LABELS } from "./constants";

export const UserDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isSuperAdmin, isFacilityAdmin } = usePermissions();
  const activeFacilityId = useAuthStore((s) => s.user?.active_facility_id);
  const { data: user, isLoading } = useUser(id);
  const [editing, setEditing] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [toRemove, setToRemove] = useState<{ id: string; name: string } | null>(null);

  const { mutate: removeFromFacility } = useRemoveUserFromFacility({
    onSuccess: () => setToRemove(null),
  });

  const { mutate: deactivate } = useDeactivateUser({
    onSuccess: () => setConfirmDeactivate(false),
    id: id!
  })

  const { mutate: requestReset } = useUpdateUserAccountStatus({
    onSuccess: () => setConfirmReset(false),
    status: "PASSWORD_RESET_ENABLED",
    id: id!
  })

  const canRequestReset = !isSuperAdmin && user?.is_active && user?.account_status !== "PASSWORD_RESET_ENABLED";
  // Facility admins may edit identity of users in their own facility; super admins, anyone.
  const userInActiveFacility = !!activeFacilityId && !!user?.facilities.some((f) => f.id === activeFacilityId);
  const canEdit = isSuperAdmin || (isFacilityAdmin && userInActiveFacility);

  if (!isLoading && !user) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin/users")}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to users
        </Button>
        <p className="text-muted-foreground">User not found.</p>
      </div>
    );
  }

  const contactRows = user
    ? [
        { label: "Email", value: user.email || "—" },
        { label: "Phone", value: user.phone ?? "—" },
        { label: "Status", value: ACCOUNT_STATUS_LABELS[user.account_status] ?? user.account_status },
        { label: "Created", value: formatDate(user.created_at) },
      ]
    : [];

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" className="text-muted-foreground -ml-2" onClick={() => navigate("/admin/users")}>
        <ArrowLeft className="mr-1 h-4 w-4" /> Back to users
      </Button>

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-primary text-lg font-bold text-primary">
            {user?.first_name?.[0]}{user?.last_name?.[0]}
          </div>
          <div>
            <h1 className="text-2xl font-bold">{user ? `${user.first_name} ${user.last_name}` : "…"}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{user?.medical_id}</p>
          </div>
        </div>
        {user && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setAssigning(true)}>
              <UserPlus className="mr-2 h-4 w-4" /> Assign to Facility
            </Button>
            {canRequestReset && (
              <Button variant="outline" onClick={() => setConfirmReset(true)}>
                <KeyRound className="mr-2 h-4 w-4" /> Request Password Reset
              </Button>
            )}
            {canEdit && (
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Pencil className="mr-2 h-4 w-4" /> Edit
              </Button>
            )}
            {isSuperAdmin && user.is_active && (
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => setConfirmDeactivate(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Deactivate
              </Button>
            )}
          </div>
        )}
      </div>

      <div className={`grid gap-6 ${isSuperAdmin ? 'lg:grid-cols-2' : 'lg:grid-cols-1'}`}>
        <Card className="p-6">
          <h2 className="text-sm font-semibold mb-4">Account</h2>
          <dl className="grid gap-5 sm:grid-cols-2">
            {contactRows.map((row) => (
              <div key={row.label}>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">{row.label}</dt>
                <dd className="mt-1 text-sm break-all">{row.value}</dd>
              </div>
            ))}
          </dl>
        </Card>
        {isSuperAdmin && (
          <Card className="p-6">
            <h2 className="text-sm font-semibold mb-4">Roles by facility</h2>
            {user && user.global_roles.length === 0 && user.facility_roles.length === 0 && (
              <p className="text-sm text-muted-foreground">No roles assigned yet.</p>
            )}
            <div className="space-y-4">
              {user && user.global_roles.length > 0 && (
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">Global</p>
                  <div className="flex flex-wrap gap-1.5">
                    {user.global_roles.map((name) => (
                      <span key={name} className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${getRoleColor(name)}`}>
                        {name.replace(/_/g, " ")}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {user?.facility_roles.map((fr) => (
                <div key={fr.facility.id}>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <Link
                      to={`/admin/facilities/${fr.facility.id}`}
                      className="group inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      {fr.facility.name}
                      <ChevronRight className="h-3 w-3 opacity-70 group-hover:translate-x-0.5 transition-transform" />
                    </Link>
                    {isSuperAdmin && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setToRemove({ id: fr.facility.id, name: fr.facility.name })}
                      >
                        <X className="h-3.5 w-3.5" />
                        <span className="ml-1 text-xs">Remove</span>
                      </Button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {fr.roles.map((name) => (
                      <span key={name} className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${getRoleColor(name)}`}>
                        {name.replace(/_/g, " ")}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      <EditUserDialog user={editing ? user ?? null : null} onClose={() => setEditing(false)} />
      <AssignUserDialog
        open={assigning}
        onOpenChange={setAssigning}
        isSuperAdmin={isSuperAdmin}
        fixedUser={user ? { id: user.id, medical_id: user.medical_id } : null}
      />

      <ConfirmDialog
        open={confirmDeactivate}
        title="Deactivate User"
        description={`Deactivate ${user?.first_name} ${user?.last_name}? They will lose system access immediately.`}
        confirmLabel="Deactivate"
        destructive
        onConfirm={() => deactivate()}
        onCancel={() => setConfirmDeactivate(false)}
      />

      <ConfirmDialog
        open={confirmReset}
        title="Request Password Reset"
        description={`Allow ${user?.first_name} ${user?.last_name} to set a new password on next login?`}
        confirmLabel="Enable Reset"
        onConfirm={() => requestReset()}
        onCancel={() => setConfirmReset(false)}
      />

      <ConfirmDialog
        open={!!toRemove}
        title="Remove from facility"
        description={`Remove ${user?.first_name} ${user?.last_name}'s roles at ${toRemove?.name}? They will lose all access at this facility.`}
        confirmLabel="Remove"
        destructive
        onConfirm={() => id && toRemove && removeFromFacility({ userId: id, facilityId: toRemove.id })}
        onCancel={() => setToRemove(null)}
      />
    </div>
  );
};
