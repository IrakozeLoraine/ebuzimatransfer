import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Bed, TrendingUp, AlertTriangle, Activity, ArrowLeftRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/organisms/DataTable";
import { useCapacity } from "@/hooks/useResources";
import { useDashboardActivity } from "@/hooks/useReport";
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

const StatSkeleton = () => (
  <div className="rounded-xl border bg-card p-5 shadow-card">
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-2 flex-1">
        <div className="h-3 w-24 rounded shimmer" />
        <div className="h-8 w-16 rounded shimmer" />
      </div>
      <div className="h-12 w-12 rounded-xl shimmer shrink-0" />
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
  const { isSuperAdmin } = usePermissions();
  const { data = [], isLoading } = useCapacity();
  const { data: activity = [], isLoading: activityLoading } = useDashboardActivity();

  const facilityName = user?.facilities?.[0]?.name;
  const scopeLabel = isSuperAdmin
    ? "across all facilities"
    : facilityName
      ? `at ${facilityName}`
      : "at your facility";

  const totalResources = data.reduce((s, r) => s + r.total, 0);
  const available = data.reduce((s, r) => s + r.available, 0);
  const occupied = data.reduce((s, r) => s + r.occupied, 0);
  const reserved = data.reduce((s, r) => s + r.reserved, 0);
  const overallRate = totalResources > 0 ? Math.round((occupied / totalResources) * 100) : 0;

  const summaryCards = [
    { label: "Total Resources", value: totalResources, icon: Bed, color: "from-slate-400 to-slate-500" },
    { label: "Available", value: available, icon: Activity, color: "from-emerald-400 to-green-500" },
    { label: "Occupied", value: occupied, icon: TrendingUp, color: "from-rose-400 to-red-500" },
    { label: "Reserved", value: reserved, icon: AlertTriangle, color: "from-amber-400 to-orange-500" },
  ];

  const chartData = data.map((r) => ({
    name: `${r.facility} · ${r.unit_type}`,
    Available: r.available,
    Occupied: r.occupied,
    Reserved: r.reserved,
  }));

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

      {/* Stat cards */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <StatSkeleton key={i} />)}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {summaryCards.map(({ label, value, icon: Icon, color }) => (
            <div
              key={label}
              className="rounded-xl border bg-card p-4 shadow-card hover:shadow-card-hover hover:-translate-y-px transition-all duration-200"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{label}</p>
                  <p className="mt-1 text-2xl font-bold">{value}</p>
                </div>
                <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br shadow-md", color)}>
                  <Icon className="h-5 w-5 text-white" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

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
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                      <ArrowLeftRight className="h-4 w-4" />
                    </div>
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
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Resource Capacity by Unit</CardTitle>
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
          data={data}
          isLoading={isLoading}
          keyExtractor={(r) => `${r.facility_id}-${r.unit_type}`}
          emptyMessage="No capacity data available"
        />
      </div>
    </div>
  );
};
