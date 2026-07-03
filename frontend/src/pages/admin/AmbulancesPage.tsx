import { useState } from "react";
import { Plus, Truck, Search } from "lucide-react";
import { DataTable } from "@/components/organisms/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { toast } from "@/components/ui/toaster";
import { getApiErrorMessage } from "@/utils/apiError";
import { useAmbulances, useUpdateAmbulance } from "@/hooks/useAmbulances";
import { useFacilities } from "@/hooks/useFacilities";
import { usePermissions } from "@/hooks/usePermissions";
import type { Ambulance, AmbulanceCredentials } from "@/types/ambulance";
import { cn } from "@/utils/cn";
import EditAmbulanceDialog from "./EditAmbulanceDialog";
import AmbulanceFormDialog from "./AmbulanceFormDialog";
import AmbulanceSetupDialog from "./AmbulanceSetupDialog";

const STATUS_STYLES: Record<string, string> = {
  AVAILABLE: "bg-emerald-100 text-emerald-700",
  ASSIGNED: "bg-blue-100 text-blue-700",
  ON_JOURNEY: "bg-amber-100 text-amber-700",
};

const STATUS_LABELS: Record<string, string> = {
  AVAILABLE: "Available",
  ASSIGNED: "Assigned",
  ON_JOURNEY: "On journey",
};

export const AmbulancesPage = () => {
  const { data: ambulances = [], isLoading } = useAmbulances();
  const { mutate: update } = useUpdateAmbulance();
  const { isSuperAdmin } = usePermissions();
  const { data: facilities = [] } = useFacilities();

  const [search, setSearch] = useState("");
  const [facilityFilter, setFacilityFilter] = useState<string>("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Ambulance | null>(null);
  const [setupCreds, setSetupCreds] = useState<AmbulanceCredentials | null>(null);

  const query = search.trim().toLowerCase();
  const filtered = ambulances.filter((a) => {
    const matchesSearch =
      !query ||
      a.plate_number.toLowerCase().includes(query) ||
      (a.driver_name ?? "").toLowerCase().includes(query) ||
      a.login_id.toLowerCase().includes(query);
    const matchesFacility = !facilityFilter || a.facility_id === facilityFilter;
    return matchesSearch && matchesFacility;
  });

  // Super admins can narrow the all-facility list to one facility.
  const facilityOptions = [
    { value: "", label: "All facilities" },
    ...facilities.map((f) => ({ value: f.id, label: f.name })),
  ];

  const toggleActive = (a: Ambulance) =>
    update(
      { id: a.id, payload: { is_active: !a.is_active } },
      {
        onSuccess: () => toast({ variant: "success", title: a.is_active ? "Ambulance disabled" : "Ambulance enabled" }),
        onError: (e) => toast({ variant: "destructive", title: "Could not update ambulance", description: getApiErrorMessage(e) }),
      }
    );

  const columns = [
    {
      header: "Ambulance",
      accessor: (a: Ambulance) => (
        <div className="flex flex-col">
          <span className="font-medium">{a.plate_number}</span>
          <span className="font-mono text-xs text-muted-foreground">{a.login_id}</span>
        </div>
      ),
    },
    {
      header: "Driver",
      accessor: (a: Ambulance) => (
        <div className="flex flex-col text-sm">
          <span>{a.driver_name ?? "—"}</span>
          {a.driver_phone && <span className="text-xs text-muted-foreground">{a.driver_phone}</span>}
        </div>
      ),
    },
    ...(isSuperAdmin
      ? [{ header: "Facility", accessor: (a: Ambulance) => <span className="text-sm">{a.facility_name ?? "—"}</span> }]
      : []),
    {
      header: "Status",
      accessor: (a: Ambulance) =>
        !a.is_active ? (
          <span className="text-xs font-medium text-muted-foreground">Disabled</span>
        ) : (
          <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", STATUS_STYLES[a.status] ?? STATUS_STYLES.AVAILABLE)}>
            {STATUS_LABELS[a.status] ?? a.status}
          </span>
        ),
    },
    {
      header: "",
      accessor: (a: Ambulance) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button size="sm" variant="ghost" onClick={() => setEditing(a)}>Edit</Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => toggleActive(a)}
          >
            {a.is_active ? "Disable" : "Enable"}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Truck className="h-6 w-6 text-primary" /> Ambulances
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Register ambulances and their driver logins. A clinician assigns an available ambulance
            when arranging transport; the driver runs the journey from their phone app.
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Register ambulance
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            placeholder="Search by plate, driver, or login…"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {isSuperAdmin && (
          <div className="w-full sm:max-w-xs">
            <Combobox
              options={facilityOptions}
              value={facilityFilter}
              onChange={setFacilityFilter}
              placeholder="All facilities"
              searchPlaceholder="Filter by facility…"
              emptyMessage="No matching facilities."
            />
          </div>
        )}
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        keyExtractor={(a) => a.id}
        emptyMessage="No ambulances match your search"
        pageSize={10}
      />

      <AmbulanceFormDialog
        open={showForm}
        onOpenChange={setShowForm}
        requireFacility={isSuperAdmin}
        facilities={facilities}
        onRegistered={setSetupCreds}
      />
      <EditAmbulanceDialog ambulance={editing} onClose={() => setEditing(null)} onReset={setSetupCreds} />
      <AmbulanceSetupDialog credentials={setupCreds} onClose={() => setSetupCreds(null)} />
    </div>
  );
};
