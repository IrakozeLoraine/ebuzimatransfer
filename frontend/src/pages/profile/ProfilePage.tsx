import { useState } from "react";
import { Pencil, KeyRound, Building2, MapPin } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getRoleColor, ACCOUNT_STATUS_LABELS } from "../admin/users/constants";
import { EditProfileDialog } from "./EditProfileDialog";
import { ChangePasswordDialog } from "./ChangePasswordDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { useFacilities } from "@/hooks/useFacilities";
import { FacilityLocationDialog } from "@/components/layout/FacilityLocationDialog";

export const ProfilePage = () => {
  const user = useAuthStore((s) => s.user);
  const { isFacilityAdmin } = usePermissions();
  const { data: facilities = [] } = useFacilities();
  const [editing, setEditing] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [settingLocation, setSettingLocation] = useState(false);

  if (!user) {
    return <p className="text-muted-foreground">Loading your profile…</p>;
  }

  const myFacility = facilities.find((f) => f.id === user.active_facility_id) ?? null;
  const hasCoords = myFacility?.latitude != null && myFacility?.longitude != null;

  const contactRows = [
    { label: "Email", value: user.email || "—" },
    { label: "Phone", value: user.phone || "—" },
    { label: "Location", value: user.location || "—" },
    { label: "Status", value: ACCOUNT_STATUS_LABELS[user.account_status] ?? user.account_status },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row items-start justify-between gap-2 gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-r-0 border-primary text-lg font-bold text-primary">
            {user.first_name?.[0]}{user.last_name?.[0]}
          </div>
          <div>
            <h1 className="text-2xl font-bold">{user.first_name} {user.last_name}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{user.medical_id}</p>
          </div>
        </div>
        <div className="flex flex-wrap justify-center md:justify-start gap-2">
          <Button variant="outline" onClick={() => setChangingPassword(true)}>
            <KeyRound className="mr-2 h-4 w-4" /> Change Password
          </Button>
          <Button variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="mr-2 h-4 w-4" /> Edit Profile
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
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

        <Card className="p-6">
          <h2 className="text-sm font-semibold mb-4">Roles by facility</h2>
          {user.facility_roles.length === 0 && user.roles.length === 0 && (
            <p className="text-sm text-muted-foreground">No roles assigned yet.</p>
          )}
          <div className="space-y-4">
            {user.facility_roles.length === 0 && user.roles.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {user.roles.map((name) => (
                  <span key={name} className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${getRoleColor(name)}`}>
                    {name.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            )}
            {user.facility_roles.map((fr) => (
              <div key={fr.facility.id}>
                <div className="mb-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Building2 className="h-3.5 w-3.5" />
                  {fr.facility.name}
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
      </div>

      {isFacilityAdmin && myFacility && (
        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Facility location</h2>
            <Button variant="outline" size="sm" onClick={() => setSettingLocation(true)}>
              <MapPin className="mr-2 h-4 w-4" />
              {hasCoords ? "Update location" : "Set location"}
            </Button>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{myFacility.name}</span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {hasCoords ? (
              <>Pinned at {myFacility.latitude!.toFixed(5)}, {myFacility.longitude!.toFixed(5)} — used for ambulance routing and live tracking.</>
            ) : (
              <>No location set yet. Pin it so ambulance routes and live tracking work for this facility.</>
            )}
          </p>
        </Card>
      )}

      <EditProfileDialog open={editing} user={user} onClose={() => setEditing(false)} />
      <ChangePasswordDialog open={changingPassword} onClose={() => setChangingPassword(false)} />
      <FacilityLocationDialog open={settingLocation} onOpenChange={setSettingLocation} />
    </div>
  );
};
