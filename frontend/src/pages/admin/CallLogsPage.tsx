import { useMemo, useState } from "react";
import { PhoneOutgoing, PhoneIncoming } from "lucide-react";
import { DataTable } from "@/components/organisms/DataTable";
import { TableToolbar, ALL_FILTER } from "@/components/molecules/TableToolbar";
import { formatDateTime } from "@/utils/format";
import { cn } from "@/utils/cn";
import { usePermissions } from "@/hooks/usePermissions";
import { useInAppCallsLog } from "@/hooks/useInAppCalls";
import { useAuthStore } from "@/store/auth.store";
import { CallButton } from "@/components/call/CallButton";
import type { InAppCall } from "@/types/incall";

type Direction = "outgoing" | "incoming" | null;

/** Direction relative to the viewer: a call they/their facility placed is outgoing;
 *  a call rung to their facility is incoming. Null when the viewer isn't a party
 *  (e.g. a super admin browsing other facilities' calls). */
const directionOf = (c: InAppCall, myUserId: string | null, myFacilityId: string | null): Direction => {
  if ((myUserId && c.caller_id === myUserId) || (myFacilityId && c.caller_facility_id === myFacilityId)) {
    return "outgoing";
  }
  if (myFacilityId && c.callee_facility_id === myFacilityId) return "incoming";
  return null;
};

const directionLabel = (d: Direction) => (d === "outgoing" ? "Outgoing" : d === "incoming" ? "Incoming" : "—");

const STATUS_META: Record<string, { label: string; cls: string }> = {
  ENDED: { label: "Completed", cls: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" },
  ONGOING: { label: "Ongoing", cls: "bg-blue-50 text-blue-700 ring-1 ring-blue-200" },
  RINGING: { label: "Ringing", cls: "bg-amber-50 text-amber-700 ring-1 ring-amber-200" },
  MISSED: { label: "Missed", cls: "bg-rose-50 text-rose-700 ring-1 ring-rose-200" },
  DECLINED: { label: "Declined", cls: "bg-rose-50 text-rose-700 ring-1 ring-rose-200" },
  CANCELLED: { label: "Cancelled", cls: "bg-gray-100 text-gray-600 ring-1 ring-gray-200" },
};

const statusLabel = (s: string) => STATUS_META[s]?.label ?? s;

/** Call duration as m:ss, or a dash when the call never connected. */
const duration = (c: InAppCall): string => {
  if (!c.started_at || !c.ended_at) return "—";
  const secs = Math.max(0, Math.round((Date.parse(c.ended_at) - Date.parse(c.started_at)) / 1000));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

interface CallBack {
  facilityId: string;
  facilityName?: string;
  unitId?: string;
  unitName?: string;
  ambulanceId?: string;
  ambulanceLabel?: string;
}

/** Who to call back, relative to the viewer's facility: a call that rang our unit is
 *  returned to the caller's facility; otherwise we redial the unit/ambulance we called. */
const callBackTarget = (c: InAppCall, myFacilityId: string | null): CallBack | null => {
  // Redial an ambulance we called.
  if (c.callee_ambulance_id) {
    return {
      facilityId: c.callee_facility_id,
      ambulanceId: c.callee_ambulance_id,
      ambulanceLabel: c.callee_name ?? "Ambulance",
    };
  }
  if (myFacilityId && c.callee_facility_id === myFacilityId) {
    // Incoming to us — ring back the caller's facility (their unit isn't recorded).
    return c.caller_facility_id
      ? { facilityId: c.caller_facility_id, facilityName: c.caller_facility_name ?? undefined }
      : null;
  }
  // Outgoing — redial the same unit we originally called.
  return {
    facilityId: c.callee_facility_id,
    facilityName: c.callee_facility_name ?? undefined,
    unitId: c.callee_unit_id ?? undefined,
    unitName: c.callee_unit_name ?? undefined,
  };
};

export const CallLogsPage = () => {
  const { isSuperAdmin } = usePermissions();
  const myFacilityId = useAuthStore((s) => s.user?.active_facility_id ?? null);
  const myUserId = useAuthStore((s) => s.user?.id ?? null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(ALL_FILTER);

  const { data: calls = [], isLoading } = useInAppCallsLog();

  const statusOptions = useMemo(
    () =>
      Array.from(new Set(calls.map((c) => c.status)))
        .sort()
        .map((s) => ({ value: s, label: statusLabel(s) })),
    [calls]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return calls.filter((c) => {
      const matchesSearch =
        !q ||
        (c.caller_name?.toLowerCase().includes(q) ?? false) ||
        (c.caller_facility_name?.toLowerCase().includes(q) ?? false) ||
        (c.callee_facility_name?.toLowerCase().includes(q) ?? false) ||
        (c.callee_unit_name?.toLowerCase().includes(q) ?? false) ||
        (c.callee_name?.toLowerCase().includes(q) ?? false);
      const matchesStatus = statusFilter === ALL_FILTER || c.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [calls, search, statusFilter]);

  const resetFilters = () => {
    setSearch("");
    setStatusFilter(ALL_FILTER);
  };

  const columns = [
    {
      header: "Direction",
      accessor: (c: InAppCall) => {
        const d = directionOf(c, myUserId, myFacilityId);
        if (!d) return <span className="text-xs text-muted-foreground">—</span>;
        const incoming = d === "incoming";
        const Icon = incoming ? PhoneIncoming : PhoneOutgoing;
        return (
          <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", incoming ? "text-blue-700" : "text-emerald-700")}>
            <Icon className="h-3.5 w-3.5" />
            {directionLabel(d)}
          </span>
        );
      },
    },
    {
      header: "Status",
      accessor: (c: InAppCall) => (
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-semibold",
            STATUS_META[c.status]?.cls ?? "bg-muted text-muted-foreground ring-1 ring-border"
          )}
        >
          {statusLabel(c.status)}
        </span>
      ),
    },
    {
      header: "Caller",
      accessor: (c: InAppCall) => (
        <div className="flex flex-col">
          <span className="text-xs font-medium">{c.caller_name ?? "—"}</span>
          {c.caller_facility_name && (
            <span className="text-xs text-muted-foreground">{c.caller_facility_name}</span>
          )}
        </div>
      ),
    },
    {
      header: "Called",
      accessor: (c: InAppCall) => (
        <div className="flex flex-col">
          <span className="text-xs font-medium">
            {c.callee_ambulance_id ? "Ambulance" : (c.callee_unit_name ?? "Facility desk")}
          </span>
          <span className="text-xs text-muted-foreground">{c.callee_facility_name ?? "—"}</span>
        </div>
      ),
    },
    {
      header: "Picked up by",
      accessor: (c: InAppCall) =>
        c.callee_name ? (
          <span className="text-xs font-medium">{c.callee_name}</span>
        ) : (
          <span className="text-xs text-muted-foreground">— not answered</span>
        ),
    },
    {
      header: "Duration",
      accessor: (c: InAppCall) => (
        <span className="font-mono text-xs text-muted-foreground">{duration(c)}</span>
      ),
    },
    {
      header: "Time",
      accessor: (c: InAppCall) => (
        <span className="text-xs text-muted-foreground">{formatDateTime(c.created_at)}</span>
      ),
    },
    {
      header: "",
      accessor: (c: InAppCall) => {
        const target = callBackTarget(c, myFacilityId);
        if (!target) return null;
        return (
          <CallButton
            facilityId={target.facilityId}
            facilityName={target.facilityName}
            unitId={target.unitId}
            unitName={target.unitName}
            ambulanceId={target.ambulanceId}
            ambulanceLabel={target.ambulanceLabel}
            referralId={c.referral_id ?? undefined}
            label="Call again"
            variant="link"
            size="sm"
          />
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Call Logs</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {isSuperAdmin
            ? "Record of all in-app coordination calls"
            : "In-app calls involving your facility"}
        </p>
      </div>

      <TableToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by caller, facility, or responder…"
        onReset={resetFilters}
        filters={[
          {
            key: "status",
            value: statusFilter,
            onChange: setStatusFilter,
            allLabel: "All statuses",
            options: statusOptions,
          },
        ]}
      />

      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        keyExtractor={(c) => c.id}
        emptyMessage="No calls match your filters"
        pageSize={10}
        exportable={{
          filename: "call-logs",
          columns: [
            { header: "Direction", value: (c) => directionLabel(directionOf(c, myUserId, myFacilityId)) },
            { header: "Status", value: (c) => statusLabel(c.status) },
            { header: "Caller", value: (c) => c.caller_name ?? "" },
            { header: "Calling Facility", value: (c) => c.caller_facility_name ?? "" },
            { header: "Receiving Facility", value: (c) => c.callee_facility_name ?? "" },
            { header: "Called Unit", value: (c) => c.callee_unit_name ?? "Facility desk" },
            { header: "Picked Up By", value: (c) => c.callee_name ?? "" },
            { header: "Answered By", value: (c) => c.callee_name ?? "" },
            { header: "Duration", value: (c) => duration(c) },
            { header: "Time", value: (c) => formatDateTime(c.created_at) },
          ],
        }}
      />
    </div>
  );
};
