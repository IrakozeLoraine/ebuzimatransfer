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
import type { Resource } from "@/types/resource";

export const FindResourcesPage = () => {
  const navigate = useNavigate();
  const { canCreateReferral } = usePermissions();
  const { data: units = [] } = useUnits();
  const [unitId, setUnitId] = useState<string>("");
  const [search, setSearch] = useState("");
  const { data: resources = [], isLoading } = useAvailableResources(unitId || null);

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
    navigate(`/transfer-requests/new?${params.toString()}`);
  };

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
    const groups = new Map<string, { facility: string; rows: Resource[] }>();
    for (const r of filtered) {
      const key = r.facility_id ?? "—";
      if (!groups.has(key)) groups.set(key, { facility: r.facility_name ?? "Unknown facility", rows: [] });
      groups.get(key)!.rows.push(r);
    }
    return [...groups.values()].sort((a, b) => a.facility.localeCompare(b.facility));
  }, [filtered]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Clinical Resource Lookup</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          All available resources across facilities. Filter by clinical unit or search to narrow down, then request a
          transfer for your patient.
        </p>
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
            {byFacility.map((group) => (
              <Card key={group.facility} className="flex h-full flex-col p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Building2 className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <h2 className="flex-1 font-semibold leading-tight">{group.facility}</h2>
                  <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                    {group.rows.length} available
                  </span>
                </div>
                <ul className="flex-1">
                  {group.rows.map((r) => (
                    <li key={r.id} className="flex flex-col gap-2 border-b border-b-neutral-100 py-2 last:border-0">
                      <div>
                        <p className="text-sm font-medium">{r.resource_name}</p>
                        <p className="font-mono text-xs text-muted-foreground">
                          {r.unit_name ? `${r.unit_name}` : ""}
                        </p>
                      </div>
                      {canCreateReferral && (
                        <Button size="sm" variant="outline" className="w-fit border-primary text-primary bg-white cursor-pointer" onClick={() => requestTransfer(r)}>
                          <ArrowLeftRight className="mr-1.5 h-3.5 w-3.5" />
                          Request Transfer
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
