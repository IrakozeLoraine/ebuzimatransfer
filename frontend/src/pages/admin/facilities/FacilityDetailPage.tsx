import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Pencil, Building2, Users, UserPlus, X, UserX, UserCheck } from "lucide-react";
import { useFacility, useFacilityUsers } from "@/hooks/useFacilities";
import { useRemoveUserFromFacility } from "@/hooks/useUser";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/components/molecules/ConfirmDialog";
import { DataTable } from "@/components/organisms/DataTable";
import type { User } from "@/types/user";
import { FacilityFormDialog } from "./FacilityFormDialog";
import { AssignUserDialog } from "../users/AssignUserDialog";
import { TYPE_BADGES, facilityTypeLabel } from "./constants";
import { getRoleColor, ACCOUNT_STATUS_LABELS } from "../users/constants";

export const FacilityDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: facility, isLoading } = useFacility(id);
  const { data: users = [], isLoading: usersLoading } = useFacilityUsers(id);
  const [tab, setTab] = useState("info");
  const [showEdit, setShowEdit] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
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
    u.facility_roles.find((fr) => fr.facility.id === id)?.roles ?? [];

  const userColumns = [
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
  ];

  if (!isLoading && !facility) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin/facilities")}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to facilities
        </Button>
        <p className="text-muted-foreground">Facility not found.</p>
      </div>
    );
  }

  const infoRows: { label: string; value: React.ReactNode }[] = facility
    ? [
      {
        label: "Type",
        value: (
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${TYPE_BADGES[facility.type] ?? "bg-muted text-muted-foreground"}`}>
            {facilityTypeLabel(facility.type)}
          </span>
        ),
      },
      { label: "Province", value: facility.province ?? "—" },
      { label: "District", value: facility.district ?? "—" },
      { label: "Location", value: facility.location ?? "—" },
      {
        label: "Status",
        value: (
          <span className={facility.is_active ? "text-emerald-600 font-medium" : "text-muted-foreground font-medium"}>
            {facility.is_active ? "Active" : "Inactive"}
          </span>
        ),
      },
    ]
    : [];

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" className="text-muted-foreground -ml-2" onClick={() => navigate("/admin/facilities")}>
        <ArrowLeft className="mr-1 h-4 w-4" /> Back to facilities
      </Button>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{facility?.name ?? "…"}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {facility ? facilityTypeLabel(facility.type) : ""}
          </p>
        </div>
        {facility && (
          <Button variant="outline" onClick={() => setShowEdit(true)}>
            <Pencil className="mr-2 h-4 w-4" /> Edit
          </Button>
        )}
      </div>

      <Tabs
        value={tab}
        onValueChange={setTab}
        tabs={[
          { value: "info", label: "Facility Information", icon: <Building2 className="h-4 w-4" /> },
          { value: "users", label: `Assigned Users (${users.length})`, icon: <Users className="h-4 w-4" /> },
        ]}
      />

      {tab === "info" && (
        <Card className="p-6">
          <dl className="grid gap-5 sm:grid-cols-2">
            {infoRows.map((row) => (
              <div key={row.label}>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">{row.label}</dt>
                <dd className="mt-1 text-sm">{row.value}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}

      {tab === "users" && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Input
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Search assigned users by name, email, or medical ID…"
              className="sm:max-w-sm"
            />
            <Button onClick={() => setShowAssign(true)}>
              <UserPlus className="mr-2 h-4 w-4" /> Assign User
            </Button>
          </div>
          <DataTable
            columns={userColumns}
            data={filteredUsers}
            isLoading={usersLoading}
            keyExtractor={(u) => u.id}
            onRowClick={(u) => navigate(`/admin/users/${u.id}`)}
            emptyMessage="No users assigned to this facility"
            pageSize={10}
          />
        </div>
      )}

      <FacilityFormDialog open={showEdit} facility={facility ?? null} onOpenChange={setShowEdit} />
      <AssignUserDialog
        open={showAssign}
        onOpenChange={setShowAssign}
        fixedFacility={facility ? { id: facility.id, name: facility.name } : null}
      />

      <ConfirmDialog
        open={!!toRemove}
        title="Remove from facility"
        description={`Remove ${toRemove?.first_name} ${toRemove?.last_name} from ${facility?.name}? They will lose all roles at this facility.`}
        confirmLabel="Remove"
        destructive
        onConfirm={() => id && toRemove && removeFromFacility({ userId: toRemove.id, facilityId: id })}
        onCancel={() => setToRemove(null)}
      />
    </div>
  );
};
