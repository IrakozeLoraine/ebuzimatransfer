import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/molecules/StatCard";
import { ExportButtons } from "@/components/molecules/ExportButtons";
import { DataTable } from "@/components/organisms/DataTable";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { useCapacity } from "@/hooks/useResources";
import { useTransitStats } from "@/hooks/useReport";
import { usePermissions } from "@/hooks/usePermissions";
import { getFacilities } from "@/api/facilities.api";
import { getReferrals } from "@/api/referrals.api";
import type { ExportColumn } from "@/utils/export";
import type { CapacityRow } from "@/types/facility";
import { useAuthStore } from "@/store/auth.store";
import { cn } from "@/utils/cn";

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
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

// Statuses that count as "accepted" — anything past the receiving side's approval.
const ACCEPTED_STATUSES = ["ACCEPTED", "TRANSPORT_ARRANGED", "EN_ROUTE", "ARRIVED"];

// Summary sections (overview, transit) export as a simple metric/value table.
type MetricRow = { metric: string; value: string | number };
const METRIC_COLUMNS: ExportColumn<MetricRow>[] = [
  { header: "Metric", value: (r) => r.metric },
  { header: "Value", value: (r) => r.value },
];

const capacityExportColumns: ExportColumn<CapacityRow>[] = [
  { header: "Hospital", value: (r) => r.facility },
  { header: "Unit", value: (r) => r.unit_type },
  { header: "Total", value: (r) => r.total },
  { header: "Available", value: (r) => r.available },
  { header: "Occupied", value: (r) => r.occupied },
  { header: "Reserved", value: (r) => r.reserved },
  { header: "Out of Service", value: (r) => r.out_of_service },
  { header: "Occupancy %", value: (r) => (r.total > 0 ? Math.round((r.occupied / r.total) * 100) : 0) },
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
  const { data: transit } = useTransitStats();

  // Platform-wide analytics — super admin only (folds in the old Reports page).
  const { data: facilities = [] } = useQuery({
    queryKey: ["facilities"],
    queryFn: getFacilities,
    enabled: isSuperAdmin,
  });
  const { data: referrals = [] } = useQuery({
    queryKey: ["referrals", undefined],
    queryFn: () => getReferrals(),
    enabled: isSuperAdmin,
  });

  const [search, setSearch] = useState("");
  const [unitFilter, setUnitFilter] = useState("");
  const [chartGroupBy, setChartGroupBy] = useState<"unit" | "facility">("unit");

  const facilityName = user?.facilities?.[0]?.name;
  const scopeLabel = isSuperAdmin
    ? "across all facilities"
    : facilityName
      ? `at ${facilityName}`
      : "at your facility";

  // Referral analytics derived from the full request list (super admin).
  const totalReferrals = referrals.length;
  const acceptedReferrals = referrals.filter((r) => ACCEPTED_STATUSES.includes(r.status)).length;
  const rejectedReferrals = referrals.filter((r) => r.status === "REJECTED").length;
  const decidedReferrals = acceptedReferrals + rejectedReferrals;
  const acceptanceRate = decidedReferrals > 0 ? Math.round((acceptedReferrals / decidedReferrals) * 100) : 0;

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

  // Export datasets for each dashboard section.
  const platformOverviewRows: MetricRow[] = [
    { metric: "Facilities", value: facilities.length },
    { metric: "Total Transfers", value: totalReferrals },
    { metric: "Accepted", value: acceptedReferrals },
    { metric: "Rejected", value: rejectedReferrals },
    { metric: "Acceptance Rate", value: `${acceptanceRate}%` },
  ];

  const resourceSummaryRows: MetricRow[] = [
    { metric: "Total Resources", value: totalResources },
    { metric: "Available", value: available },
    { metric: "Occupied", value: occupied },
    { metric: "Reserved", value: reserved },
    { metric: "Overall Occupancy", value: `${overallRate}%` },
  ];

  const transitRows: MetricRow[] = transit
    ? [
        { metric: "Completed journeys", value: transit.completed_journeys },
        { metric: "Average time (min)", value: transit.average_minutes ?? "—" },
        { metric: "Fastest time (min)", value: transit.fastest_minutes ?? "—" },
        { metric: "Slowest time (min)", value: transit.slowest_minutes ?? "—" },
        ...ARRIVAL_CONDITION_META.map((c) => ({
          metric: `Arrivals — ${c.label}`,
          value: transit.arrival_conditions[c.key] ?? 0,
        })),
      ]
    : [];

  return (
    <div className="space-y-7">
      {/* Greeting header */}
      <div className="flex flex-col md:flex-row items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {getGreeting()}, {user?.first_name ?? "there"} 👋
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Here's a live overview of resource capacity {scopeLabel}.
          </p>
        </div>
        {totalResources > 0 && (
          <div className="self-end text-right">
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

      {/* Platform overview — super admin only */}
      {isSuperAdmin && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">Platform overview</h2>
            <ExportButtons filename="platform-overview" columns={METRIC_COLUMNS} rows={platformOverviewRows} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <StatCard label="Facilities" value={facilities.length} onClick={() => navigate("/admin/facilities")} />
            <StatCard label="Total Transfers" value={totalReferrals} onClick={() => navigate("/transfer-requests")} />
            <StatCard label="Accepted" value={acceptedReferrals} onClick={() => navigate("/transfer-requests?category=APPROVED")} />
            <StatCard label="Rejected" value={rejectedReferrals} onClick={() => navigate("/transfer-requests?category=REJECTED")} />
            <StatCard label="Acceptance Rate" value={`${acceptanceRate}%`} onClick={() => navigate("/transfer-requests")} />
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="w-full space-y-1.5 sm:max-w-xs">
          <Label>Search</Label>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isSuperAdmin ? "Search by facility or unit…" : "Search by unit…"}
          />
        </div>
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

      {/* Resource summary */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">Resource summary</h2>
          <ExportButtons
            filename="resource-summary"
            columns={METRIC_COLUMNS}
            rows={resourceSummaryRows}
            disabled={isLoading}
          />
        </div>
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
      </div>

      {/* Ambulance transit-time tracking report */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
          <CardTitle className="text-base">Ambulance transit times</CardTitle>
          <ExportButtons
            filename="ambulance-transit-times"
            columns={METRIC_COLUMNS}
            rows={transitRows}
            disabled={transitRows.length === 0}
          />
        </CardHeader>
        <CardContent>
          {transit && transit.completed_journeys > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "Completed journeys", value: transit.completed_journeys, accent: "border-l-slate-300", valueClass: "text-foreground" },
                { label: "Average time", value: formatMinutes(transit.average_minutes), accent: "border-l-indigo-400", valueClass: "text-indigo-600" },
                { label: "Fastest (best)", value: formatMinutes(transit.fastest_minutes), accent: "border-l-emerald-400", valueClass: "text-emerald-600" },
                { label: "Slowest (worst)", value: formatMinutes(transit.slowest_minutes), accent: "border-l-rose-400", valueClass: "text-rose-600" },
              ].map(({ label, value, accent, valueClass }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => navigate("/transfer-requests?category=APPROVED")}
                  className={cn(
                    "rounded-xl border border-l-4 bg-card p-4 text-left shadow-card transition-all duration-200 cursor-pointer hover:shadow-card-hover hover:-translate-y-px",
                    accent
                  )}
                >
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
                  <p className={cn("mt-1.5 text-3xl font-bold tabular-nums", valueClass)}>{value}</p>
                </button>
              ))}
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
              <div className="flex flex-wrap justify-center md:justify-start gap-2">
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

      {/* Capacity chart */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-sm font-semibold">
            Resource Capacity by {groupBy === "facility" ? "Facility" : "Unit"}
          </CardTitle>
          <div className="flex items-center gap-2">
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
            <ExportButtons
              filename={`resource-capacity-by-${groupBy}`}
              columns={[
                { header: groupBy === "facility" ? "Facility" : "Unit", value: (d) => d.name },
                { header: "Available", value: (d) => d.Available },
                { header: "Occupied", value: (d) => d.Occupied },
                { header: "Reserved", value: (d) => d.Reserved },
              ]}
              rows={chartData}
              disabled={isLoading}
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <ChartSkeleton />
          ) : chartData.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No capacity data</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData} barSize={16}>
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

      {/* Detailed capacity table */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Capacity by facility &amp; unit</h2>
        <DataTable
          columns={columns}
          data={filtered}
          isLoading={isLoading}
          keyExtractor={(r) => `${r.facility_id}-${r.unit_type}`}
          emptyMessage="No capacity data matches your filters"
          pageSize={10}
          exportable={{ filename: "capacity-by-facility-unit", columns: capacityExportColumns }}
        />
      </div>
    </div>
  );
};
