import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuthStore } from "@/store/auth.store";
import { cn } from "@/utils/cn";
import { useGetDashboard } from "@/hooks/useReport";

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
};

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

const STATUS_BREAKDOWN = [
  { key: "requested",   label: "Requested",   color: "bg-blue-500" },
  { key: "under_review", label: "Under Review", color: "bg-amber-500" },
  { key: "accepted",    label: "Accepted",    color: "bg-emerald-500" },
  { key: "en_route",   label: "En Route",    color: "bg-indigo-500" },
] as const;

export const DashboardPage = () => {
  const user = useAuthStore((s) => s.user);
  const { data, isLoading } = useGetDashboard();

  const chartData =
    data?.capacity.map((r) => ({
      name: `${r.facility} ${r.unit_type}`,
      Available: r.available,
      Occupied: r.occupied,
      Reserved: r.reserved,
    })) ?? [];

  return (
    <div className="space-y-7">
      {/* Greeting header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {getGreeting()}, {user?.first_name ?? "there"} 👋
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Here's a live overview of your referral network.
        </p>
      </div>

      {/* Stat cards */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <StatSkeleton key={i} />)}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        </div>
      )}

      {/* Charts row */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Referral Status Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <ChartSkeleton />
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {STATUS_BREAKDOWN.map(({ key, label, color }) => (
                  <div
                    key={key}
                    className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/20 p-4 transition-colors hover:bg-muted/40"
                  >
                    <div className={cn("h-3 w-3 rounded-full", color)} />
                    <div>
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="text-lg font-bold">
                        {0}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
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
    </div>
  );
};
