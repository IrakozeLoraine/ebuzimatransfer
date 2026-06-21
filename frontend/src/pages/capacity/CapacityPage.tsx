import { useCapacity } from "@/hooks/useResources";
import { DataTable } from "@/components/organisms/DataTable";
import type { CapacityRow } from "@/types/facility";
import { cn } from "@/utils/cn";
import { Bed, TrendingUp, AlertTriangle, Activity } from "lucide-react";

const columns = [
  { header: "Hospital", accessor: (r: CapacityRow) => <span className="font-semibold">{r.facility}</span> },
  {
    header: "Unit",
    accessor: (r: CapacityRow) => (
      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">{r.unit_type}</span>
    ),
  },
  {
    header: "Total",
    accessor: (r: CapacityRow) => <span className="font-semibold">{r.total}</span>,
  },
  {
    header: "Available",
    accessor: (r: CapacityRow) => (
      <span className="font-semibold text-emerald-600">{r.available}</span>
    ),
  },
  {
    header: "Occupied",
    accessor: (r: CapacityRow) => (
      <span className="font-semibold text-rose-600">{r.occupied}</span>
    ),
  },
  {
    header: "Reserved",
    accessor: (r: CapacityRow) => (
      <span className="font-semibold text-amber-600">{r.reserved}</span>
    ),
  },
  { header: "Out of Service", accessor: (r: CapacityRow) => r.out_of_service },
  {
    header: "Occupancy",
    accessor: (r: CapacityRow) => {
      const rate = r.total > 0 ? Math.round((r.occupied / r.total) * 100) : 0;
      const color =
        rate > 90 ? "bg-rose-500" : rate > 70 ? "bg-amber-500" : "bg-emerald-500";
      const textColor =
        rate > 90 ? "text-rose-700 font-bold" : rate > 70 ? "text-amber-700 font-semibold" : "text-emerald-700";
      return (
        <div className="flex items-center gap-2.5">
          <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all duration-500", color)}
              style={{ width: `${rate}%` }}
            />
          </div>
          <span className={cn("text-xs tabular-nums", textColor)}>{rate}%</span>
        </div>
      );
    },
  },
];

export const CapacityPage = () => {
  const { data = [], isLoading } = useCapacity();

  const totalResources = data.reduce((s, r) => s + r.total, 0);
  const available = data.reduce((s, r) => s + r.available, 0);
  const occupied = data.reduce((s, r) => s + r.occupied, 0);
  const reserved = data.reduce((s, r) => s + r.reserved, 0);
  const overallRate = totalResources > 0 ? Math.round((occupied / totalResources) * 100) : 0;

  const summaryCards = [
    { label: "Total Resources", value: totalResources, icon: Bed, color: "from-slate-400 to-slate-500", textColor: "text-slate-700" },
    { label: "Available", value: available, icon: Activity, color: "from-emerald-400 to-green-500", textColor: "text-emerald-700" },
    { label: "Occupied", value: occupied, icon: TrendingUp, color: "from-rose-400 to-red-500", textColor: "text-rose-700" },
    { label: "Reserved", value: reserved, icon: AlertTriangle, color: "from-amber-400 to-orange-500", textColor: "text-amber-700" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Capacity Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Real-time ICU/HDU resource availability across all facilities
          </p>
        </div>
        {totalResources > 0 && (
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Overall occupancy</p>
            <p className={cn("text-2xl font-bold tabular-nums",
              overallRate > 90 ? "text-rose-600" : overallRate > 70 ? "text-amber-600" : "text-emerald-600"
            )}>
              {overallRate}%
            </p>
          </div>
        )}
      </div>

      {/* Summary row */}
      <div className="grid gap-4 sm:grid-cols-4">
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

      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        keyExtractor={(r) => `${r.facility_id}-${r.unit_type}`}
        emptyMessage="No capacity data available"
      />
    </div>
  );
};
