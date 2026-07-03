import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ArrowLeftRight, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { usePermissions } from "@/hooks/usePermissions";
import { useUnits } from "@/hooks/useUnits";
import { useAvailableResources } from "@/hooks/useResources";
import { useAuthStore } from "@/store/auth.store";
import { CallButton } from "@/components/call/CallButton";
import type { Resource } from "@/types/resource";

export const FindResourcesPage = () => {
  const navigate = useNavigate();
  const { canCreateReferral } = usePermissions();
  // You can't transfer a patient into your own department, so resources in the
  // unit(s) the clinician works in at their own facility are excluded. Other units
  // at their facility — and any unit elsewhere — remain visible.
  const myFacilityId = useAuthStore((s) => s.user?.active_facility_id ?? null);
  const myUnitIds = useAuthStore((s) => s.user?.unit_ids ?? []);
  const { data: units = [] } = useUnits();
  const [unitId, setUnitId] = useState<string>("");
  const [search, setSearch] = useState("");
  const { data: allResources = [], isLoading } = useAvailableResources(unitId || null);
  const resources = useMemo(
    () =>
      allResources.filter(
        (r) => !(r.facility_id === myFacilityId && r.unit_id != null && myUnitIds.includes(r.unit_id))
      ),
    [allResources, myFacilityId, myUnitIds]
  );

  const unitOptions = [
    { value: "", label: "All clinical units" },
    ...units.map((u) => ({ value: u.id, label: u.name })),
  ];

  // Requesting a transfer opens the transfer-request form prefilled with the
  // destination facility + clinical unit; approval reserves the resource.
  const requestTransfer = (r: Resource) => {
    const params = new URLSearchParams();
    if (r.facility_id) params.set("facility", r.facility_id);
    if (r.unit_id) params.set("unit", r.unit_id);
    params.set("resource", r.id);
    navigate(`/transfer-requests/new?${params.toString()}`);
  };

  // Top-level entry point: opens a blank transfer-request form with no prefill.
  const requestTransferBlank = () => navigate("/transfer-requests/new");

  // Free-text filtering on top of the (optionally unit-scoped) results.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return resources;
    return resources.filter(
      (r) =>
        r.resource_name.toLowerCase().includes(q) ||
        (r.facility_name ?? "").toLowerCase().includes(q) ||
        (r.unit_name ?? "").toLowerCase().includes(q)
    );
  }, [resources, search]);

  // Group filtered resources by owning facility.
  const byFacility = useMemo(() => {
    const groups = new Map<string, { id: string | null; facility: string; rows: Resource[] }>();
    for (const r of filtered) {
      const key = r.facility_id ?? "—";
      if (!groups.has(key)) groups.set(key, { id: r.facility_id ?? null, facility: r.facility_name ?? "Unknown facility", rows: [] });
      groups.get(key)!.rows.push(r);
    }
    return [...groups.values()].sort((a, b) => a.facility.localeCompare(b.facility));
  }, [filtered]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Clinical Resource Lookup</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            All available resources across facilities. Filter by clinical unit or search to narrow down, then request a
            transfer for your patient.
          </p>
        </div>
        {canCreateReferral && (
          <Button className="w-fit shrink-0" onClick={requestTransferBlank}>
            <ArrowLeftRight className="mr-1.5 h-4 w-4" />
            Request Transfer
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="w-full space-y-1.5 sm:max-w-xs">
          <Label>Clinical unit</Label>
          <Combobox
            options={unitOptions}
            value={unitId}
            onChange={setUnitId}
            placeholder="All clinical units"
            searchPlaceholder="Search units…"
            emptyMessage="No matching units."
          />
        </div>
        <div className="w-full space-y-1.5 sm:max-w-xs">
          <Label>Search</Label>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name or facility…"
          />
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Searching…</p>
      ) : byFacility.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          <Search className="mx-auto mb-2 h-6 w-6 opacity-50" />
          No available resources match your filters right now.
        </Card>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            {filtered.length} available resource{filtered.length === 1 ? "" : "s"} across {byFacility.length} facilit
            {byFacility.length === 1 ? "y" : "ies"}
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {byFacility.map((group) => {
              const total = group.rows.reduce((sum, r) => sum + r.available, 0);
              return (
                <Card key={group.facility} className="flex h-full flex-col p-4">
                  {/* Facility header: name and total availability. Calls are placed
                      per unit on each resource row below. */}
                  <div className="flex items-start gap-2.5 border-b pb-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <Building2 className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate font-semibold leading-tight">{group.facility}</h2>
                      <p className="text-xs font-medium text-emerald-700">{total} available</p>
                    </div>
                  </div>

                  <ul className="flex-1 divide-y divide-border/35">
                    {group.rows.map((r) => (
                      <li key={r.id} className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2 justify-between pt-2">
                          <p className="text-sm font-medium">{r.resource_name}</p>
                          {canCreateReferral && (
                            <div className="flex shrink-0 items-center gap-1">
                              {group.id && r.unit_id && (
                                <CallButton
                                  facilityId={group.id}
                                  facilityName={group.facility}
                                  unitId={r.unit_id}
                                  unitName={r.unit_name ?? undefined}
                                  label="Call"
                                  variant="link"
                                  size="sm"
                                />
                              )}
                              <Button size="sm" variant="link" onClick={() => requestTransfer(r)}>
                                <ArrowLeftRight className="mr-1.5 h-3.5 w-3.5" />
                                Request
                              </Button>
                            </div>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground pb-2">
                          {[r.unit_name, `${r.available} available`].filter(Boolean).join(" · ")}
                        </p>
                      </li>
                    ))}
                  </ul>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
