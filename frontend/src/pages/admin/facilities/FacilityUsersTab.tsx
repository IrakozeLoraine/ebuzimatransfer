import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { UserPlus, Upload, X, UserCheck, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/molecules/ConfirmDialog";
import { DataTable } from "@/components/organisms/DataTable";
import { useFacilityUsers } from "@/hooks/useFacilities";
import { useRemoveUserFromFacility } from "@/hooks/useUser";
import type { User } from "@/types/user";
import { AssignUserDialog } from "../users/AssignUserDialog";
import { UserImportDialog } from "../users/UserImportDialog";
import { getRoleColor, ACCOUNT_STATUS_LABELS } from "../users/constants";

interface Props {
  facilityId: string;
  facilityName: string;
  isInactive: boolean;
  /** Super admins assign to / remove from any facility; facility admins assign
   *  to their own and cannot remove (that endpoint is super-admin only). */
  isSuperAdmin: boolean;
}

export const FacilityUsersTab = ({ facilityId, facilityName, isInactive, isSuperAdmin }: Props) => {
  const navigate = useNavigate();
  const { data: users = [], isLoading: usersLoading } = useFacilityUsers(facilityId);
  const [showAssign, setShowAssign] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [toRemove, setToRemove] = useState<User | null>(null);

  const { mutate: removeFromFacility } = useRemoveUserFromFacility({
    onSuccess: () => setToRemove(null),
  });

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        `${u.first_name} ${u.last_name}`.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.medical_id.toLowerCase().includes(q)
    );
  }, [users, userSearch]);

  const rolesAtFacility = (u: User) =>
    u.facility_roles.find((fr) => fr.facility.id === facilityId)?.roles ?? [];

  const columns = [
    {
      header: "Name",
      accessor: (u: User) => (
        <div>
          <p className="font-semibold">{u.first_name} {u.last_name}</p>
          <p className="text-xs text-muted-foreground">{u.medical_id}</p>
        </div>
      ),
    },
    { header: "Email", accessor: (u: User) => <span className="text-sm text-muted-foreground">{u.email}</span> },
    {
      header: "Roles here",
      accessor: (u: User) => (
        <div className="flex flex-wrap gap-1.5">
          {rolesAtFacility(u).map((name) => (
            <span key={name} className={`rounded-full px-2 py-0.5 text-xs font-medium ${getRoleColor(name)}`}>
              {name.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      ),
    },
    {
      header: "Status",
      accessor: (u: User) => {
        const label = ACCOUNT_STATUS_LABELS[u.account_status] ?? u.account_status;
        const colorClass =
          u.account_status === "ACTIVE"
            ? "text-emerald-600"
            : u.account_status === "PASSWORD_RESET_ENABLED"
              ? "text-amber-600"
              : "text-muted-foreground";
        return (
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${colorClass}`}>
            {u.is_active ? <UserCheck className="h-3.5 w-3.5" /> : <UserX className="h-3.5 w-3.5" />}
            {label}
          </span>
        );
      },
    },
    ...(isSuperAdmin
      ? [
          {
            header: "",
            accessor: (u: User) => (
              <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setToRemove(u)}
                >
                  <X className="mr-1 h-4 w-4" /> Remove
                </Button>
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          value={userSearch}
          onChange={(e) => setUserSearch(e.target.value)}
          placeholder="Search assigned users by name, email, or medical ID…"
          className="sm:max-w-sm"
        />
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowImport(true)}
            disabled={isInactive}
            title={isInactive ? "Reactivate the facility to import users" : undefined}
          >
            <Upload className="mr-2 h-4 w-4" /> Import
          </Button>
          <Button
            onClick={() => setShowAssign(true)}
            disabled={isInactive}
            title={isInactive ? "Reactivate the facility to assign users" : undefined}
          >
            <UserPlus className="mr-2 h-4 w-4" /> Assign User
          </Button>
        </div>
      </div>
      <DataTable
        columns={columns}
        data={filteredUsers}
        isLoading={usersLoading}
        keyExtractor={(u) => u.id}
        onRowClick={(u) => navigate(`/admin/users/${u.id}`)}
        emptyMessage="No users assigned to this facility"
        pageSize={10}
        exportable={{
          filename: `${facilityName}-users`,
          columns: [
            { header: "Name", value: (u) => `${u.first_name} ${u.last_name}` },
            { header: "Medical ID", value: (u) => u.medical_id },
            { header: "Email", value: (u) => u.email },
            {
              header: "Roles",
              value: (u) => rolesAtFacility(u).map((r) => r.replace(/_/g, " ")).join(", "),
            },
            { header: "Status", value: (u) => ACCOUNT_STATUS_LABELS[u.account_status] ?? u.account_status },
          ],
        }}
      />

      {/* Super admins assign to this specific facility; facility admins assign to
          their own (the targeted endpoint is super-admin only). */}
      <AssignUserDialog
        open={showAssign}
        onOpenChange={setShowAssign}
        isSuperAdmin={isSuperAdmin}
        fixedFacility={isSuperAdmin ? { id: facilityId, name: facilityName } : null}
      />

      <UserImportDialog
        open={showImport}
        onOpenChange={setShowImport}
        facilityId={facilityId}
        facilityName={facilityName}
      />

      {isSuperAdmin && (
        <ConfirmDialog
          open={!!toRemove}
          title="Remove from facility"
          description={`Remove ${toRemove?.first_name} ${toRemove?.last_name} from ${facilityName}? They will lose all roles at this facility.`}
          confirmLabel="Remove"
          destructive
          onConfirm={() => toRemove && removeFromFacility({ userId: toRemove.id, facilityId })}
          onCancel={() => setToRemove(null)}
        />
      )}
    </div>
  );
};
