import { useQuery } from "@tanstack/react-query";
import { getReferralReport, getOccupancyReport, exportCsv, exportExcel } from "@/api/reports.api";
import { StatCard } from "@/components/molecules/StatCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts";
import { FileText, CheckCircle, XCircle, Download, TrendingUp } from "lucide-react";
import { DataTable } from "@/components/organisms/DataTable";
import { cn } from "@/utils/cn";
import { OccupancyRow } from "@/types/report";

const getOccupancyColor = (rate: number) => {
  if (rate > 90) return "hsl(0 84% 60%)";
  if (rate > 70) return "hsl(38 92% 50%)";
  return "hsl(142 72% 42%)";
};

export const ReportsPage = () => {
  const { data: referralReport } = useQuery({
    queryKey: ["report-referrals"],
    queryFn: () => getReferralReport(),
  });

  const { data: occupancy = [] } = useQuery({
    queryKey: ["report-occupancy"],
    queryFn: getOccupancyReport,
  });

  const occupancyColumns = [
    { header: "Facility", accessor: (r: OccupancyRow) => <span className="font-semibold">{r.facility}</span> },
    {
      header: "Unit",
      accessor: (r: OccupancyRow) => (
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">{r.unit_type}</span>
      ),
    },
    { header: "Total Resources", accessor: (r: OccupancyRow) => r.total_resources },
    { header: "Occupied", accessor: (r: OccupancyRow) => <span className="font-semibold text-rose-600">{r.occupied_resources}</span> },
    {
      header: "Occupancy %",
      accessor: (r: OccupancyRow) => (
        <div className="flex items-center gap-2">
          <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${r.occupancy_rate}%`, backgroundColor: getOccupancyColor(r.occupancy_rate) }}
            />
          </div>
          <span
            className={cn(
              "text-xs font-semibold tabular-nums",
              r.occupancy_rate > 90
                ? "text-rose-600"
                : r.occupancy_rate > 70
                ? "text-amber-600"
                : "text-emerald-600"
            )}
          >
            {r.occupancy_rate.toFixed(1)}%
          </span>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Analytics and performance data</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="mr-2 h-4 w-4" />
            CSV
          </Button>
          <Button variant="outline" size="sm" onClick={exportExcel}>
            <Download className="mr-2 h-4 w-4" />
            Excel
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Total Referrals" value={referralReport?.total_referrals ?? 0} icon={FileText} accent="teal" />
        <StatCard label="Accepted" value={referralReport?.accepted ?? 0} icon={CheckCircle} accent="emerald" />
        <StatCard label="Rejected" value={referralReport?.rejected ?? 0} icon={XCircle} accent="rose" />
        <StatCard
          label="Acceptance Rate"
          value={`${referralReport?.acceptance_rate ?? 0}%`}
          icon={TrendingUp}
          accent="violet"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Occupancy by Facility & Unit</CardTitle>
        </CardHeader>
        <CardContent>
          {occupancy.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No occupancy data available</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={occupancy} barSize={16}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(210 20% 92%)" />
                <XAxis
                  dataKey="facility"
                  tick={{ fontSize: 11 }}
                  stroke="hsl(215 15% 65%)"
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  unit="%"
                  stroke="hsl(215 15% 65%)"
                  domain={[0, 100]}
                />
                <Tooltip
                  formatter={(v: number) => [`${v.toFixed(1)}%`, "Occupancy"]}
                  contentStyle={{
                    background: "hsl(0 0% 100%)",
                    border: "1px solid hsl(210 20% 88%)",
                    borderRadius: "10px",
                    boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="occupancy_rate" name="Occupancy %" radius={[4, 4, 0, 0]}>
                  {occupancy.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={getOccupancyColor(entry.occupancy_rate)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <DataTable
        columns={occupancyColumns}
        data={occupancy}
        keyExtractor={(r) => `${r.facility}-${r.unit_type}`}
        emptyMessage="No occupancy data"
      />
    </div>
  );
};
