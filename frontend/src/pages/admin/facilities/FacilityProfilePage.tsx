import { useState } from "react";
import { Building2, Users, Layers, Phone } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { useFacility, useFacilityUsers } from "@/hooks/useFacilities";
import { useUnits } from "@/hooks/useUnits";
import { Card } from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";
import { FacilityPhoneLinesTab } from "./FacilityPhoneLinesTab";
import { FacilityUsersTab } from "./FacilityUsersTab";
import { TYPE_BADGES, facilityTypeLabel } from "./constants";

/** A facility admin's view of their own facility — mirrors the super-admin
 *  facility detail page but scoped to the admin's active facility and without
 *  catalog-level edit/remove controls. */
export const FacilityProfilePage = () => {
  const facilityId = useAuthStore((s) => s.user?.active_facility_id) ?? undefined;
  const { data: facility, isLoading } = useFacility(facilityId);
  const { data: users = [] } = useFacilityUsers(facilityId);
  const { data: units = [] } = useUnits({ facility_id: facilityId }, { enabled: !!facilityId });
  const [tab, setTab] = useState("info");

  const isInactive = !!facility && !facility.is_active;

  if (!facilityId) {
    return (
      <p className="text-muted-foreground">
        Your account isn't linked to a facility yet. Ask a super admin to assign you to one.
      </p>
    );
  }

  if (!isLoading && !facility) {
    return <p className="text-muted-foreground">Facility not found.</p>;
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
      <div>
        <h1 className="text-2xl font-bold">{facility?.name ?? "…"}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {facility ? facilityTypeLabel(facility.type) : ""}
        </p>
      </div>

      {isInactive && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">This facility is deactivated</p>
          <p className="text-xs text-amber-700">
            You can't assign users or add phone lines while it's inactive. Contact a super admin to reactivate it.
          </p>
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
          isSuperAdmin={false}
        />
      )}

      {tab === "units" && (
        <Card className="p-6">
          <p className="mb-4 text-sm text-muted-foreground">
            Units available at this facility are derived from its tier. Higher tiers automatically inherit lower-tier
            units.
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

      {tab === "phones" && facility && <FacilityPhoneLinesTab facilityId={facility.id} disabled={isInactive} />}
    </div>
  );
};
