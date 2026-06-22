import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/organisms/DataTable";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { useCapacity } from "@/hooks/useResources";
import { useDashboardActivity, useTransitStats } from "@/hooks/useReport";
import { usePermissions } from "@/hooks/usePermissions";
import type { CapacityRow } from "@/types/facility";
import { useAuthStore } from "@/store/auth.store";
import { cn } from "@/utils/cn";

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
};

const timeAgo = (iso: string | null) => {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
};

const columns = [
  { header: "Hospital", accessor: (r: CapacityRow) => <span className="font-semibold">{r.facility}</span> },
  {
    header: "Unit",
    accessor: (r: CapacityRow) => (
      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">{r.unit_type}</span>
    ),
  },
  { header: "Total", accessor: (r: CapacityRow) => <span className="font-semibold">{r.total}</span> },
  {
    header: "Available",
    accessor: (r: CapacityRow) => <span className="font-semibold text-emerald-600">{r.available}</span>,
  },
  {
    header: "Occupied",
    accessor: (r: CapacityRow) => <span className="font-semibold text-rose-600">{r.occupied}</span>,
  },
  {
    header: "Reserved",
    accessor: (r: CapacityRow) => <span className="font-semibold text-amber-600">{r.reserved}</span>,
  },
  { header: "Out of Service", accessor: (r: CapacityRow) => r.out_of_service },
  {
    header: "Occupancy",
    accessor: (r: CapacityRow) => {
      const rate = r.total > 0 ? Math.round((r.occupied / r.total) * 100) : 0;
      const color = rate > 90 ? "bg-rose-500" : rate > 70 ? "bg-amber-500" : "bg-emerald-500";
      const textColor =
        rate > 90 ? "text-rose-700 font-bold" : rate > 70 ? "text-amber-700 font-semibold" : "text-emerald-700";
      return (
        <div className="flex items-center gap-2.5">
          <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
            <div className={cn("h-full rounded-full transition-all duration-500", color)} style={{ width: `${rate}%` }} />
          </div>
          <span className={cn("text-xs tabular-nums", textColor)}>{rate}%</span>
        </div>
      );
    },
  },
];

const ARRIVAL_CONDITION_META: { key: string; label: string; className: string }[] = [
  { key: "STABLE", label: "Stable", className: "bg-emerald-100 text-emerald-700" },
  { key: "CRITICAL", label: "Critical", className: "bg-amber-100 text-amber-700" },
  { key: "DETERIORATED", label: "Deteriorated", className: "bg-orange-100 text-orange-700" },
  { key: "ARRIVED_DECEASED", label: "Deceased on arrival", className: "bg-rose-100 text-rose-700" },
];

const formatMinutes = (m: number | null): string => {
  if (m === null) return "—";
  if (m < 60) return `${Math.round(m)} min`;
  const h = Math.floor(m / 60);
  const rem = Math.round(m % 60);
  return rem ? `${h}h ${rem}m` : `${h}h`;
};

const StatSkeleton = () => (
  <div className="rounded-xl border border-l-4 bg-card p-4 shadow-card">
    <div className="space-y-2">
      <div className="h-3 w-20 rounded shimmer" />
      <div className="h-8 w-16 rounded shimmer" />
    </div>
  </div>
);

const ChartSkeleton = () => (
  <div className="space-y-3 py-2">
    <div className="h-4 w-40 rounded shimmer" />
    <div className="h-48 w-full rounded-lg shimmer" />
  </div>
);

export const DashboardPage = () => {
  const user = useAuthStore((s) => s.user);
  const { isSuperAdmin, canViewResources } = usePermissions();
  const navigate = useNavigate();
  const { data = [], isLoading } = useCapacity();
  const { data: activity = [], isLoading: activityLoading } = useDashboardActivity();
  const { data: transit } = useTransitStats();

  const [search, setSearch] = useState("");
  const [unitFilter, setUnitFilter] = useState("");
  const [chartGroupBy, setChartGroupBy] = useState<"unit" | "facility">("unit");

  const facilityName = user?.facilities?.[0]?.name;
  const scopeLabel = isSuperAdmin
    ? "across all facilities"
    : facilityName
      ? `at ${facilityName}`
      : "at your facility";

  // Distinct units present in the capacity data, for the unit filter dropdown.
  const unitOptions = useMemo(
    () => [
      { value: "", label: "All units" },
      ...[...new Set(data.map((r) => r.unit_type))].sort().map((u) => ({ value: u, label: u })),
    ],
    [data]
  );

  // Apply the unit filter and free-text (facility or unit) search.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.filter(
      (r) =>
        (unitFilter ? r.unit_type === unitFilter : true) &&
        (q ? r.facility.toLowerCase().includes(q) || r.unit_type.toLowerCase().includes(q) : true)
    );
  }, [data, search, unitFilter]);

  const totalResources = filtered.reduce((s, r) => s + r.total, 0);
  const available = filtered.reduce((s, r) => s + r.available, 0);
  const occupied = filtered.reduce((s, r) => s + r.occupied, 0);
  const reserved = filtered.reduce((s, r) => s + r.reserved, 0);
  const overallRate = totalResources > 0 ? Math.round((occupied / totalResources) * 100) : 0;

  const summaryCards = [
    { label: "Total Resources", value: totalResources, accent: "border-l-slate-300", valueClass: "text-foreground", status: "" },
    { label: "Available", value: available, accent: "border-l-emerald-400", valueClass: "text-emerald-600", status: "AVAILABLE" },
    { label: "Occupied", value: occupied, accent: "border-l-rose-400", valueClass: "text-rose-600", status: "OCCUPIED" },
    { label: "Reserved", value: reserved, accent: "border-l-amber-400", valueClass: "text-amber-600", status: "RESERVED" },
  ];

  // Clicking a card opens Resource Management pre-filtered by that status.
  const goToResources = (status: string) => {
    if (!canViewResources) return;
    navigate(status ? `/resources?status=${status}` : "/resources");
  };

  // The capacity chart can be grouped by unit or by facility. Facility admins
  // (and other single-facility roles) only get the by-unit breakdown.
  const groupBy = isSuperAdmin ? chartGroupBy : "unit";
  const chartData = useMemo(() => {
    const map = new Map<string, { name: string; Available: number; Occupied: number; Reserved: number }>();
    for (const r of filtered) {
      const name = groupBy === "facility" ? r.facility : r.unit_type;
      const e = map.get(name) ?? { name, Available: 0, Occupied: 0, Reserved: 0 };
      e.Available += r.available;
      e.Occupied += r.occupied;
      e.Reserved += r.reserved;
      map.set(name, e);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [filtered, groupBy]);

  return (
    <div className="space-y-7">
      {/* Greeting header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {getGreeting()}, {user?.first_name ?? "there"} 👋
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Here's a live overview of resource capacity {scopeLabel}.
          </p>
        </div>
        {totalResources > 0 && (
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Overall occupancy</p>
            <p
              className={cn(
                "text-2xl font-bold tabular-nums",
                overallRate > 90 ? "text-rose-600" : overallRate > 70 ? "text-amber-600" : "text-emerald-600"
              )}
            >
              {overallRate}%
            </p>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        {isSuperAdmin && (
          <div className="w-full space-y-1.5 sm:max-w-xs">
            <Label>Search</Label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by facility or unit…"
            />
          </div>
        )}
        <div className="w-full space-y-1.5 sm:max-w-xs">
          <Label>Filter by unit</Label>
          <Combobox
            options={unitOptions}
            value={unitFilter}
            onChange={setUnitFilter}
            placeholder="All units"
            searchPlaceholder="Search units…"
            emptyMessage="No matching units."
          />
        </div>
      </div>

      {/* Stat cards */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <StatSkeleton key={i} />)}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {summaryCards.map(({ label, value, accent, valueClass, status }) => (
            <button
              key={label}
              type="button"
              onClick={() => goToResources(status)}
              disabled={!canViewResources}
              className={cn(
                "rounded-xl border border-l-4 bg-card p-4 text-left shadow-card transition-all duration-200",
                accent,
                canViewResources
                  ? "cursor-pointer hover:shadow-card-hover hover:-translate-y-px"
                  : "cursor-default"
              )}
            >
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className={cn("mt-1.5 text-3xl font-bold tabular-nums", valueClass)}>{value}</p>
            </button>
          ))}
        </div>
      )}

      {/* Ambulance transit-time tracking report */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Ambulance transit times</CardTitle>
        </CardHeader>
        <CardContent>
          {transit && transit.completed_journeys > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-l-4 border-l-slate-300 bg-card p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Completed journeys</p>
                <p className="mt-1.5 text-3xl font-bold tabular-nums text-foreground">{transit.completed_journeys}</p>
              </div>
              <div className="rounded-xl border border-l-4 border-l-indigo-400 bg-card p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Average time</p>
                <p className="mt-1.5 text-3xl font-bold tabular-nums text-indigo-600">{formatMinutes(transit.average_minutes)}</p>
              </div>
              <div className="rounded-xl border border-l-4 border-l-emerald-400 bg-card p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Fastest (best)</p>
                <p className="mt-1.5 text-3xl font-bold tabular-nums text-emerald-600">{formatMinutes(transit.fastest_minutes)}</p>
              </div>
              <div className="rounded-xl border border-l-4 border-l-rose-400 bg-card p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Slowest (worst)</p>
                <p className="mt-1.5 text-3xl font-bold tabular-nums text-rose-600">{formatMinutes(transit.slowest_minutes)}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No completed ambulance journeys yet. Stats appear once transfers reach the destination.
            </p>
          )}

          {/* Patient arrival-condition breakdown */}
          <div className="mt-5 border-t pt-4">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Patient arrival condition
            </p>
            {transit && ARRIVAL_CONDITION_META.some((c) => (transit.arrival_conditions[c.key] ?? 0) > 0) ? (
              <div className="flex flex-wrap gap-2">
                {ARRIVAL_CONDITION_META.map((c) => (
                  <span
                    key={c.key}
                    className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium", c.className)}
                  >
                    {c.label}
                    <span className="tabular-nums font-bold">{transit.arrival_conditions[c.key] ?? 0}</span>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No arrival conditions recorded yet.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Charts row */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {activityLoading ? (
              <ChartSkeleton />
            ) : activity.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No transfer requests yet.
              </p>
            ) : (
              <ul className="max-h-64 space-y-3 overflow-auto">
                {activity.map((a) => (
                  <li key={a.id} className="flex items-start gap-3">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-400" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        <span className="font-medium">{a.reserved_by_name ?? "Someone"}</span>{" "}
                        requested a transfer for{" "}
                        <span className="font-medium">{a.resource_name}</span>
                        {isSuperAdmin && a.facility_name ? ` at ${a.facility_name}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {a.unit_name ? `${a.unit_name} · ` : ""}
                        {timeAgo(a.created_at)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-sm font-semibold">
              Resource Capacity by {groupBy === "facility" ? "Facility" : "Unit"}
            </CardTitle>
            {isSuperAdmin && (
              <div className="flex rounded-md border p-0.5">
                {(["unit", "facility"] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setChartGroupBy(g)}
                    className={cn(
                      "rounded px-2 py-1 text-xs font-medium capitalize transition-colors",
                      groupBy === g ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    By {g}
                  </button>
                ))}
              </div>
            )}
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <ChartSkeleton />
            ) : chartData.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">No capacity data</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData} barSize={12}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(210 20% 92%)" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(215 15% 65%)" />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(215 15% 65%)" />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(0 0% 100%)",
                      border: "1px solid hsl(210 20% 88%)",
                      borderRadius: "10px",
                      boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
                      fontSize: "12px",
                    }}
                  />
                  <Bar dataKey="Available" fill="hsl(142 72% 42%)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Occupied" fill="hsl(0 84% 60%)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Reserved" fill="hsl(38 92% 50%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detailed capacity table */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Capacity by facility &amp; unit</h2>
        <DataTable
          columns={columns}
          data={filtered}
          isLoading={isLoading}
          keyExtractor={(r) => `${r.facility_id}-${r.unit_type}`}
          emptyMessage="No capacity data matches your filters"
        />
      </div>
    </div>
  );
};
