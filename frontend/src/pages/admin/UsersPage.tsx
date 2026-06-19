import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { getUsers, createUser, deactivateUser, assignUserToFacility, updateUserAccountStatus } from "@/api/users.api";
import { DataTable } from "@/components/organisms/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/molecules/ConfirmDialog";
import { Plus, Trash2, UserCheck, UserX } from "lucide-react";
import type { User } from "@/types/user";
import { formatDate } from "@/utils/format";
import { userSchema, assignUserSchema, type UserFormValues, type AssignUserFormValues } from "@/schemas/user.schema";
import { usePermissions } from "@/hooks/usePermissions";
import { PasswordInput } from "@/components/atoms/PasswordInput";

const SUPER_ADMIN_ROLES = [
  "REFERRING_CLINICIAN",
  "ICU_COORDINATOR",
  "AMBULANCE_COORDINATOR",
  "FACILITY_ADMIN",
  "SUPER_ADMIN",
];

const ROLE_COLORS: Record<string, string> = {
  SUPER_ADMIN: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
  FACILITY_ADMIN: "bg-violet-50 text-violet-700 ring-1 ring-violet-200",
  ICU_COORDINATOR: "bg-teal-50 text-teal-700 ring-1 ring-teal-200",
  REFERRING_CLINICIAN: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  AMBULANCE_COORDINATOR: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
};

const getRoleColor = (name: string) =>
  ROLE_COLORS[name] ?? "bg-muted text-muted-foreground ring-1 ring-border";

const ACCOUNT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  PASSWORD_RESET_ENABLED: "Reset Required",
};

export const UsersPage = () => {
  const qc = useQueryClient();
  const { isSuperAdmin } = usePermissions();
  const [showCreate, setShowCreate] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [toDeactivate, setToDeactivate] = useState<User | null>(null);
  const [statusTarget, setStatusTarget] = useState<User | null>(null);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: getUsers,
  });

  const { mutate: create, isPending: creating } = useMutation({
    mutationFn: (data: UserFormValues) =>
      createUser({
        email: data.email,
        medical_id: data.medical_id,
        first_name: data.first_name,
        last_name: data.last_name,
        phone: data.phone,
        password: data.password,
        roles: [data.role],
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setShowCreate(false);
      createForm.reset();
    },
  });

  const { mutate: assign, isPending: assigning } = useMutation({
    mutationFn: (data: AssignUserFormValues) => assignUserToFacility({ medical_id: data.medical_id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setShowAssign(false);
      assignForm.reset();
    },
  });

  const { mutate: deactivate } = useMutation({
    mutationFn: (id: string) => deactivateUser(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setToDeactivate(null);
    },
  });

  const { mutate: setStatus } = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      updateUserAccountStatus(id, { account_status: status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setStatusTarget(null);
    },
  });

  const createForm = useForm<UserFormValues>({ resolver: zodResolver(userSchema) });
  const assignForm = useForm<AssignUserFormValues>({ resolver: zodResolver(assignUserSchema) });

  const columns = [
    {
      header: "Name",
      accessor: (u: User) => (
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-emerald-500 text-xs font-bold text-white">
            {u.first_name[0]}{u.last_name[0]}
          </div>
          <div>
            <p className="font-semibold">{u.first_name} {u.last_name}</p>
            <p className="text-xs text-muted-foreground">{u.medical_id}</p>
          </div>
        </div>
      ),
    },
    { header: "Email", accessor: (u: User) => <span className="text-muted-foreground text-sm">{u.email}</span> },
    {
      header: "Roles",
      accessor: (u: User) => (
        <div className="flex gap-1.5 flex-wrap">
          {u.roles.map((r) => (
            <span key={r.id} className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${getRoleColor(r.name)}`}>
              {r.name.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      ),
    },
    {
      header: "Facilities",
      accessor: (u: User) => (
        <span className="text-xs text-muted-foreground">
          {u.facilities.length > 0 ? u.facilities.map((f) => f.name).join(", ") : "—"}
        </span>
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
    {
      header: "Created",
      accessor: (u: User) => <span className="text-xs text-muted-foreground">{formatDate(u.created_at)}</span>,
    },
    {
      header: "",
      accessor: (u: User) => (
        <div className="flex gap-1">
          {isSuperAdmin && u.is_active && (
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              onClick={() => setToDeactivate(u)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">User Management</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{users.length} users</p>
        </div>
        <div className="flex gap-2">
          {isSuperAdmin && (
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New User
            </Button>
          )}
        </div>
      </div>

      <DataTable
        columns={columns}
        data={users}
        isLoading={isLoading}
        keyExtractor={(u) => u.id}
        emptyMessage="No users found"
      />

      {/* SUPER_ADMIN: create user */}
      <Dialog open={showCreate} onOpenChange={(o) => { setShowCreate(o); if (!o) createForm.reset(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create New User</DialogTitle>
          </DialogHeader>
          <form onSubmit={createForm.handleSubmit((d) => create(d))} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>First Name</Label>
                <Input {...createForm.register("first_name")} />
                {createForm.formState.errors.first_name && (
                  <p className="text-xs text-destructive">{createForm.formState.errors.first_name.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Last Name</Label>
                <Input {...createForm.register("last_name")} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Medical ID</Label>
              <Input placeholder="e.g. RC-CHUK-001" {...createForm.register("medical_id")} />
              {createForm.formState.errors.medical_id && (
                <p className="text-xs text-destructive">{createForm.formState.errors.medical_id.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" {...createForm.register("email")} />
              {createForm.formState.errors.email && (
                <p className="text-xs text-destructive">{createForm.formState.errors.email.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Phone <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input placeholder="0788xxxxxx" {...createForm.register("phone")} />
            </div>
            <div className="space-y-1.5">
              <Label>Password</Label>
              <PasswordInput {...createForm.register("password")} />
              {createForm.formState.errors.password && (
                <p className="text-xs text-destructive">{createForm.formState.errors.password.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select onValueChange={(v) => createForm.setValue("role", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {SUPER_ADMIN_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{r.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {createForm.formState.errors.role && (
                <p className="text-xs text-destructive">{createForm.formState.errors.role.message}</p>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button type="submit" disabled={creating}>{creating ? "Creating…" : "Create User"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* FACILITY_ADMIN: assign user by medical_id */}
      <Dialog open={showAssign} onOpenChange={(o) => { setShowAssign(o); if (!o) assignForm.reset(); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Assign User to Facility</DialogTitle>
          </DialogHeader>
          <form onSubmit={assignForm.handleSubmit((d) => assign(d))} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Enter the Medical ID of a registered user to add them to your facility.
            </p>
            <div className="space-y-1.5">
              <Label>Medical ID</Label>
              <Input placeholder="e.g. RC-CHUK-001" {...assignForm.register("medical_id")} />
              {assignForm.formState.errors.medical_id && (
                <p className="text-xs text-destructive">{assignForm.formState.errors.medical_id.message}</p>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowAssign(false)}>Cancel</Button>
              <Button type="submit" disabled={assigning}>{assigning ? "Assigning…" : "Assign User"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

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
