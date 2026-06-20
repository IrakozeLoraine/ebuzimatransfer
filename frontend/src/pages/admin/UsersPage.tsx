import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getUsers, deactivateUser, updateUserAccountStatus } from "@/api/users.api";
import { DataTable } from "@/components/organisms/DataTable";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/molecules/ConfirmDialog";
import { TableToolbar, ALL_FILTER } from "@/components/molecules/TableToolbar";
import { Plus, UserPlus } from "lucide-react";
import type { User } from "@/types/user";
import { usePermissions } from "@/hooks/usePermissions";
import { SUPER_ADMIN_ROLES, ACCOUNT_STATUS_LABELS } from "./users/constants";
import { getUserColumns } from "./users/userColumns";
import { toast } from "@/components/ui/toaster";
import { getApiErrorMessage } from "@/utils/apiError";
import { CreateUserDialog } from "./users/CreateUserDialog";
import { AssignUserDialog } from "./users/AssignUserDialog";
import { EditUserDialog } from "./users/EditUserDialog";

export const UsersPage = () => {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { isSuperAdmin } = usePermissions();
  const [showCreate, setShowCreate] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [toDeactivate, setToDeactivate] = useState<User | null>(null);
  const [statusTarget, setStatusTarget] = useState<User | null>(null);
  const [editing, setEditing] = useState<User | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState(ALL_FILTER);
  const [statusFilter, setStatusFilter] = useState(ALL_FILTER);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: getUsers,
  });

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      const matchesSearch =
        !q ||
        `${u.first_name} ${u.last_name}`.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.medical_id.toLowerCase().includes(q);
      const userRoleNames = [
        ...u.global_roles,
        ...u.facility_roles.flatMap((fr) => fr.roles),
      ];
      const matchesRole =
        roleFilter === ALL_FILTER || userRoleNames.includes(roleFilter);
      const matchesStatus =
        statusFilter === ALL_FILTER || u.account_status === statusFilter;
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, search, roleFilter, statusFilter]);

  const resetFilters = () => {
    setSearch("");
    setRoleFilter(ALL_FILTER);
    setStatusFilter(ALL_FILTER);
  };

  const { mutate: deactivate } = useMutation({
    mutationFn: (id: string) => deactivateUser(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      toast({ variant: "success", title: "User deactivated" });
      setToDeactivate(null);
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Failed to deactivate user",
        description: getApiErrorMessage(error),
      });
    },
  });

  const { mutate: setStatus } = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      updateUserAccountStatus(id, { account_status: status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      toast({ variant: "success", title: "Account status updated" });
      setStatusTarget(null);
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Failed to update status",
        description: getApiErrorMessage(error),
      });
    },
  });

  const columns = getUserColumns({
    isSuperAdmin,
    onView: (u) => navigate(`/admin/users/${u.id}`),
    onEdit: setEditing,
    onDeactivate: setToDeactivate,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">User Management</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {filteredUsers.length === users.length
              ? `${users.length} users`
              : `${filteredUsers.length} of ${users.length} users`}
          </p>
        </div>
        <div className="flex gap-2">
          {/* Facility admins add a registered user to their own facility here;
              super admins assign from a user's or facility's detail page. */}
          {!isSuperAdmin && (
            <Button variant="outline" onClick={() => setShowAssign(true)}>
              <UserPlus className="mr-2 h-4 w-4" />
              Assign to Facility
            </Button>
          )}
          {isSuperAdmin && (
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New User
            </Button>
          )}
        </div>
      </div>

      <TableToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name, email, or medical ID…"
        onReset={resetFilters}
        filters={[
          {
            key: "role",
            value: roleFilter,
            onChange: setRoleFilter,
            allLabel: "All roles",
            options: SUPER_ADMIN_ROLES.map((r) => ({
              value: r,
              label: r.replace(/_/g, " "),
            })),
          },
          {
            key: "status",
            value: statusFilter,
            onChange: setStatusFilter,
            allLabel: "All statuses",
            options: Object.entries(ACCOUNT_STATUS_LABELS).map(([value, label]) => ({
              value,
              label,
            })),
          },
        ]}
      />

      <DataTable
        columns={columns}
        data={filteredUsers}
        isLoading={isLoading}
        keyExtractor={(u) => u.id}
        onRowClick={(u) => navigate(`/admin/users/${u.id}`)}
        emptyMessage="No users match your filters"
        pageSize={10}
      />

      <CreateUserDialog open={showCreate} onOpenChange={setShowCreate} />

      <AssignUserDialog open={showAssign} onOpenChange={setShowAssign} isSuperAdmin={isSuperAdmin} />

      <EditUserDialog user={editing} onClose={() => setEditing(null)} />

      {/* SUPER_ADMIN: deactivate */}
      <ConfirmDialog
        open={!!toDeactivate}
        title="Deactivate User"
        description={`Deactivate ${toDeactivate?.first_name} ${toDeactivate?.last_name}? They will lose system access immediately.`}
        confirmLabel="Deactivate"
        destructive
        onConfirm={() => toDeactivate && deactivate(toDeactivate.id)}
        onCancel={() => setToDeactivate(null)}
      />

      {/* FACILITY_ADMIN: enable password reset */}
      <ConfirmDialog
        open={!!statusTarget}
        title="Enable Password Reset"
        description={`Allow ${statusTarget?.first_name} ${statusTarget?.last_name} to set a new password on next login?`}
        confirmLabel="Enable Reset"
        destructive={false}
        onConfirm={() => statusTarget && setStatus({ id: statusTarget.id, status: "PASSWORD_RESET_ENABLED" })}
        onCancel={() => setStatusTarget(null)}
      />
    </div>
  );
};
