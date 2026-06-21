import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useReferrals } from "@/hooks/useReferrals";
import { DataTable } from "@/components/organisms/DataTable";
import { StatusBadge } from "@/components/atoms/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Search } from "lucide-react";
import type { Referral, ReferralStatus } from "@/types/referral";
import { formatDateTime } from "@/utils/format";
import { usePermissions } from "@/hooks/usePermissions";
import { REFERRAL_STATUS_LABELS } from "./constants";

const STATUSES: ReferralStatus[] = [
  "REQUESTED", "UNDER_REVIEW", "ACCEPTED", "TRANSPORT_ARRANGED",
  "EN_ROUTE", "ARRIVED", "REJECTED", "CANCELLED",
];

const URGENCY_COLORS: Record<string, string> = {
  IMMEDIATE: "text-rose-600 font-semibold",
  URGENT: "text-amber-600 font-medium",
  NON_URGENT: "text-muted-foreground",
};

export const ReferralsPage = () => {
  const navigate = useNavigate();
  const { canCreateReferral } = usePermissions();
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");

  const { data: referrals = [], isLoading } = useReferrals(
    statusFilter !== "ALL" ? { status: statusFilter } : undefined
  );

  const filtered = referrals.filter(
    (r) =>
      r.referral_number.toLowerCase().includes(search.toLowerCase()) ||
      r.patient_code.toLowerCase().includes(search.toLowerCase()) ||
      r.diagnosis.toLowerCase().includes(search.toLowerCase())
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Referrals</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {filtered.length} referral{filtered.length !== 1 ? "s" : ""} found
          </p>
        </div>
        {canCreateReferral && (
          <Button onClick={() => navigate("/referrals/new")}>
            <Plus className="mr-2 h-4 w-4" />
            New Referral
          </Button>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex gap-3 rounded-xl border border-border/60 bg-card/60 backdrop-blur-sm p-3 shadow-sm">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
          <Input
            placeholder="Search by ref #, patient code, diagnosis…"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{REFERRAL_STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        onRowClick={(r) => navigate(`/referrals/${r.id}`)}
        keyExtractor={(r) => r.id}
        emptyMessage="No referrals match your search"
      />
    </div>
  );
};
