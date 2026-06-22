import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getTransportQueue, createTransport, updateTransport } from "@/api/transport.api";
import { DataTable } from "@/components/organisms/DataTable";
import { StatusBadge } from "@/components/atoms/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/responsive-dialog";
import { formatDateTime } from "@/utils/format";
import type { Referral } from "@/types/referral";
import type { TransportEvent, UpdateTransportPayload } from "@/types/transport";
import { Truck } from "lucide-react";

const toIso = (local: string) => (local ? new Date(local).toISOString() : undefined);

export const TransportPage = () => {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Referral | null>(null);
  const [ambulanceId, setAmbulanceId] = useState("");
  const [timesEvent, setTimesEvent] = useState<TransportEvent | null>(null);
  const [times, setTimes] = useState<Record<keyof UpdateTransportPayload, string>>({
    dispatch_time: "",
    pickup_time: "",
    departure_time: "",
    arrival_time: "",
  });

  const { data: queue = [], isLoading } = useQuery({
    queryKey: ["transport-queue"],
    queryFn: getTransportQueue,
    refetchInterval: 15_000,
  });

  const { mutate: assign, isPending } = useMutation({
    mutationFn: () =>
      createTransport({
        referral_id: (selected as Referral).id,
        ambulance_identifier: ambulanceId,
      }),
    onSuccess: (event) => {
      qc.invalidateQueries({ queryKey: ["transport-queue"] });
      qc.invalidateQueries({ queryKey: ["referrals"] });
      setSelected(null);
      setAmbulanceId("");
      setTimesEvent(event);
    },
  });

  const { mutate: saveTimes, isPending: savingTimes } = useMutation({
    mutationFn: () => {
      const payload: UpdateTransportPayload = {
        dispatch_time: toIso(times.dispatch_time),
        pickup_time: toIso(times.pickup_time),
        departure_time: toIso(times.departure_time),
        arrival_time: toIso(times.arrival_time),
      };
      return updateTransport((timesEvent as TransportEvent).id, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transport-queue"] });
      qc.invalidateQueries({ queryKey: ["referrals"] });
      closeTimes();
    },
  });

  const closeTimes = () => {
    setTimesEvent(null);
    setTimes({ dispatch_time: "", pickup_time: "", departure_time: "", arrival_time: "" });
  };

  const columns = [
    {
      header: "Ref #",
      accessor: (r: Referral) => (
        <span className="font-mono text-xs font-semibold text-foreground/80">{r.referral_number}</span>
      ),
    },
    { header: "Patient Code", accessor: (r: Referral) => <span className="font-medium">{r.patient_code}</span> },
    {
      header: "Urgency",
      accessor: (r: Referral) => {
        const colors: Record<string, string> = {
          IMMEDIATE: "text-rose-600 font-bold",
          URGENT: "text-amber-600 font-semibold",
          NON_URGENT: "text-muted-foreground",
        };
        return (
          <span className={colors[r.urgency] ?? ""}>
            {r.urgency.replace(/_/g, " ")}
          </span>
        );
      },
    },
    { header: "Status", accessor: (r: Referral) => <StatusBadge status={r.status} /> },
    {
      header: "Created",
      accessor: (r: Referral) => (
        <span className="text-xs text-muted-foreground">{formatDateTime(r.created_at)}</span>
      ),
    },
    {
      header: "Action",
      accessor: (r: Referral) => (
        <Button
          size="sm"
          onClick={() => setSelected(r)}
          className="gap-1.5"
        >
          <Truck className="h-3.5 w-3.5" />
          Assign
        </Button>
      ),
    },
  ];

  const timeFields: { key: keyof UpdateTransportPayload; label: string }[] = [
    { key: "dispatch_time", label: "Dispatch Time" },
    { key: "pickup_time", label: "Pickup Time" },
    { key: "departure_time", label: "Departure Time" },
    { key: "arrival_time", label: "Arrival Time" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Transport Queue</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Accepted referrals awaiting ambulance assignment
        </p>
      </div>

      <DataTable
        columns={columns}
        data={queue as Referral[]}
        isLoading={isLoading}
        keyExtractor={(r) => r.id}
        emptyMessage="No referrals awaiting transport"
      />

      {/* Assign ambulance dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-primary" />
              Assign Ambulance
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-muted/40 px-4 py-3 text-sm">
              Referral: <span className="font-mono font-semibold">{selected?.referral_number}</span>
              {" · "}{selected?.patient_code}
            </div>
            <div className="space-y-1.5">
              <Label>Ambulance Identifier <span className="text-destructive">*</span></Label>
              <Input
                placeholder="e.g. AMB-01"
                value={ambulanceId}
                onChange={(e) => setAmbulanceId(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSelected(null)}>Cancel</Button>
              <Button onClick={() => assign()} disabled={!ambulanceId || isPending}>
                {isPending ? "Assigning…" : "Assign & Dispatch"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Record times dialog */}
      <Dialog open={!!timesEvent} onOpenChange={(o) => !o && closeTimes()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Transport Times</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              Ambulance <span className="font-semibold text-foreground">{timesEvent?.ambulance_identifier}</span>.
              Setting the arrival time will mark the referral as arrived.
            </div>
            {timeFields.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label>{f.label}</Label>
                <Input
                  type="datetime-local"
                  value={times[f.key]}
                  onChange={(e) =>
                    setTimes((t) => ({ ...t, [f.key]: e.target.value }))
                  }
                />
              </div>
            ))}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={closeTimes}>Done Later</Button>
              <Button onClick={() => saveTimes()} disabled={savingTimes}>
                {savingTimes ? "Saving…" : "Save Times"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
