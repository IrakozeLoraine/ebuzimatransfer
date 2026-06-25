import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Pencil, Building2, Users, UserX, Layers, Phone, RotateCcw } from "lucide-react";
import { useFacility, useFacilityUsers, useReactivateFacility } from "@/hooks/useFacilities";
import { useUnits } from "@/hooks/useUnits";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";
import { FacilityFormDialog } from "./FacilityFormDialog";
import { FacilityPhoneLinesTab } from "./FacilityPhoneLinesTab";
import { FacilityUsersTab } from "./FacilityUsersTab";
import { TYPE_BADGES, facilityTypeLabel } from "./constants";

export const FacilityDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: facility, isLoading } = useFacility(id);
  const { data: users = [] } = useFacilityUsers(id);
  const { data: units = [] } = useUnits({ facility_id: id }, { enabled: !!id });
  const [tab, setTab] = useState("info");
  const [showEdit, setShowEdit] = useState(false);

  const { mutate: reactivate, isPending: reactivating } = useReactivateFacility();

  const isInactive = !!facility && !facility.is_active;

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

      <div className="flex flex-col md:flex-row items-start justify-between gap-2">
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

      {isInactive && (
        <div className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <UserX className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-medium text-amber-900">This facility is deactivated</p>
              <p className="text-xs text-amber-700">
                You can't assign users or add phone lines while it's inactive. Reactivate it to make changes.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            className="shrink-0 border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
            disabled={reactivating}
            onClick={() => facility && reactivate(facility.id)}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            {reactivating ? "Reactivating…" : "Reactivate"}
          </Button>
        </div>
      )}

      <Tabs
        value={tab}
        onValueChange={setTab}
        tabs={[
          { value: "info", label: "Facility Information", icon: <Building2 className="h-4 w-4" /> },
          { value: "users", label: `Assigned Users (${users.length})`, icon: <Users className="h-4 w-4" /> },
          { value: "units", label: `Clinical Units (${units.length})`, icon: <Layers className="h-4 w-4" /> },
          { value: "phones", label: "Phone Lines", icon: <Phone className="h-4 w-4" /> },
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

      {tab === "users" && facility && (
        <FacilityUsersTab
          facilityId={facility.id}
          facilityName={facility.name}
          isInactive={isInactive}
          isSuperAdmin
        />
      )}

      {tab === "units" && (
        <Card className="p-6">
          <p className="mb-4 text-sm text-muted-foreground">
            Units are derived from this facility's tier and the{" "}
            <button type="button" className="text-primary hover:underline" onClick={() => navigate("/admin/units")}>
              clinical units catalog
            </button>
            . Higher tiers automatically inherit lower-tier units.
          </p>
          {units.length === 0 ? (
            <p className="text-sm text-muted-foreground">No clinical units available at this facility's tier.</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {units.map((u) => (
                <li key={u.id} className="flex items-center gap-2 rounded-md border p-2.5 text-sm">
                  <Layers className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="font-medium">{u.name}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === "phones" && id && <FacilityPhoneLinesTab facilityId={id} disabled={isInactive} />}

      <FacilityFormDialog open={showEdit} facility={facility ?? null} onOpenChange={setShowEdit} />
    </div>
  );
};
