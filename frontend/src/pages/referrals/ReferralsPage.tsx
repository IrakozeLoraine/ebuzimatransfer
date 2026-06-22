import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useReferrals } from "@/hooks/useReferrals";
import { DataTable } from "@/components/organisms/DataTable";
import { StatusBadge } from "@/components/atoms/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search } from "lucide-react";
import type { Referral } from "@/types/referral";
import { formatDateTime } from "@/utils/format";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/utils/cn";

// Requests are grouped into three decision categories.
const CATEGORIES = [
  { key: "PENDING", label: "Pending", statuses: ["REQUESTED", "UNDER_REVIEW"] },
  { key: "APPROVED", label: "Approved", statuses: ["ACCEPTED", "TRANSPORT_ARRANGED", "EN_ROUTE", "ARRIVED"] },
  { key: "REJECTED", label: "Rejected", statuses: ["REJECTED", "CANCELLED"] },
] as const;

const URGENCY_COLORS: Record<string, string> = {
  IMMEDIATE: "text-rose-600 font-semibold",
  URGENT: "text-amber-600 font-medium",
  NON_URGENT: "text-muted-foreground",
};

export const ReferralsPage = () => {
  const navigate = useNavigate();
  const { canCreateReferral } = usePermissions();
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]["key"]>("PENDING");
  const [search, setSearch] = useState("");

  const { data: referrals = [], isLoading } = useReferrals();

  const activeStatuses = CATEGORIES.find((c) => c.key === category)!.statuses as readonly string[];
  const counts = CATEGORIES.reduce(
    (acc, c) => ({ ...acc, [c.key]: referrals.filter((r) => (c.statuses as readonly string[]).includes(r.status)).length }),
    {} as Record<string, number>
  );

  const filtered = referrals.filter(
    (r) =>
      activeStatuses.includes(r.status) &&
      (r.referral_number.toLowerCase().includes(search.toLowerCase()) ||
        r.patient_code.toLowerCase().includes(search.toLowerCase()) ||
        r.diagnosis.toLowerCase().includes(search.toLowerCase()))
  );

  const columns = [
    {
      header: "Ref #",
      accessor: (r: Referral) => (
        <span className="font-mono text-xs font-semibold text-foreground/80">{r.referral_number}</span>
      ),
    },
    { header: "Patient Code", accessor: (r: Referral) => <span className="font-medium">{r.patient_code}</span> },
    {
      header: "Diagnosis",
      accessor: (r: Referral) => (
        <span className="max-w-[200px] truncate block text-sm text-muted-foreground">{r.diagnosis}</span>
      ),
    },
    {
      header: "Urgency",
      accessor: (r: Referral) => (
        <span className={URGENCY_COLORS[r.urgency] ?? ""}>{r.urgency.replace(/_/g, " ")}</span>
      ),
    },
    { header: "Status", accessor: (r: Referral) => <StatusBadge status={r.status} /> },
    {
      header: "Created",
      accessor: (r: Referral) => (
        <span className="text-xs text-muted-foreground">{formatDateTime(r.created_at)}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Transfer Requests</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Patient transfer requests across your clinical unit and facilities.
          </p>
        </div>
        {canCreateReferral && (
          <Button onClick={() => navigate("/transfer-requests/new")}>
            <Plus className="mr-2 h-4 w-4" />
            New Transfer Request
          </Button>
        )}
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap items-center gap-1 rounded-lg border bg-muted/30 p-1">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setCategory(c.key)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              category === c.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {c.label}
            <span className="ml-1.5 text-xs text-muted-foreground">{counts[c.key] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
        <Input
          placeholder="Search by ref #, patient code, diagnosis…"
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        onRowClick={(r) => navigate(`/transfer-requests/${r.id}`)}
        keyExtractor={(r) => r.id}
        emptyMessage={`No ${category.toLowerCase()} transfer requests`}
      />
    </div>
  );
};
