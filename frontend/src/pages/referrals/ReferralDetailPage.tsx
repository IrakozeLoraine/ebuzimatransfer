import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useReferral, useAcceptReferral, useQuickAcceptReferral, useRejectReferral, useRecordArrivalCondition, useArrangeTransport, useRemoveTransport, useMarkArrived } from "@/hooks/useReferrals";
import type { ArrivalCondition } from "@/types/referral";
import { useResources } from "@/hooks/useResources";
import { useAmbulances } from "@/hooks/useAmbulances";
import { useFacilities } from "@/hooks/useFacilities";
import { useUnits } from "@/hooks/useUnits";
import { useAuthStore } from "@/store/auth.store";
import { toast } from "@/components/ui/toaster";
import { getApiErrorMessage } from "@/utils/apiError";
import { Zap, Truck, Volume2, Sparkles } from "lucide-react";
import { StatusBadge } from "@/components/atoms/StatusBadge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Check, X, Clock, Ambulance } from "lucide-react";
import { formatDateTime } from "@/utils/format";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/utils/cn";
import RejectDialog from "./RejectDialog";
import { CallCoordinationCard } from "./CallCoordinationCard";
import { CallButton } from "@/components/call/CallButton";
import { DynamicFormDetails } from "@/components/referral/DynamicFormDetails";
import { TransportMonitoringCard } from "@/components/referral/TransportMonitoringCard";
import { ReferralFeedbackSection } from "@/components/referral/ReferralFeedbackSection";
import { getFormDef } from "@/config/transferForms";

const ARRIVAL_CONDITIONS: { value: ArrivalCondition; label: string }[] = [
  { value: "STABLE", label: "Stable" },
  { value: "CRITICAL", label: "Critical" },
  { value: "DETERIORATED", label: "Deteriorated" },
  { value: "ARRIVED_DECEASED", label: "Deceased on arrival" },
];

const ARRIVAL_CONDITION_STYLES: Record<ArrivalCondition, string> = {
  STABLE: "bg-emerald-100 text-emerald-700",
  CRITICAL: "bg-amber-100 text-amber-700",
  DETERIORATED: "bg-orange-100 text-orange-700",
  ARRIVED_DECEASED: "bg-rose-100 text-rose-700",
};

const arrivalConditionLabel = (c: string) =>
  ARRIVAL_CONDITIONS.find((x) => x.value === c)?.label ?? c.replace(/_/g, " ");

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex gap-3">
    <span className="w-36 shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
    <span className="text-sm font-medium text-foreground">{value}</span>
  </div>
);

export const ReferralDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { canAcceptReferral, isSuperAdmin } = usePermissions();
  const me = useAuthStore((s) => s.user);
  const { data: referral, isLoading } = useReferral(id!);
  const { data: resources = [] } = useResources();
  const { data: ambulances = [] } = useAmbulances(true);
  const { data: facilities = [] } = useFacilities();
  const { data: allUnits = [] } = useUnits();
  const { mutate: accept, isPending: accepting } = useAcceptReferral();
  const { mutate: quickAccept, isPending: quickAccepting } = useQuickAcceptReferral();
  const { mutate: reject, isPending: rejecting } = useRejectReferral();
  const { mutate: recordCondition, isPending: recordingCondition } = useRecordArrivalCondition();
  const { mutate: arrangeTransport, isPending: arranging } = useArrangeTransport();
  const { mutate: removeTransport, isPending: removing } = useRemoveTransport();
  const { mutate: markArrived, isPending: markingArrived } = useMarkArrived();
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [selectedResourceId, setSelectedResourceId] = useState("");
  const [selectedCondition, setSelectedCondition] = useState<ArrivalCondition | "">("");
  const [ambulanceId, setAmbulanceId] = useState("");

  const availableResources = resources.filter((r) => r.available > 0);

  // Default the manual pick to the resource the requester actually asked for, when
  // it's still available — the approver can override it. Adjusting state during
  // render (rather than in an effect) avoids a cascading re-render; the guard on
  // selectedResourceId makes it a one-shot that converges immediately.
  const requestedResourceId = referral?.requested_resource_id;
  if (
    requestedResourceId &&
    !selectedResourceId &&
    availableResources.some((r) => r.id === requestedResourceId)
  ) {
    setSelectedResourceId(requestedResourceId);
  }

  const handleAccept = () => {
    if (!selectedResourceId || !id) return;
    accept(
      { id, payload: { resource_id: selectedResourceId } },
      {
        onSuccess: () => toast({ variant: "success", title: "Transfer request approved" }),
        onError: (e) => toast({ variant: "destructive", title: "Could not approve", description: getApiErrorMessage(e) }),
      }
    );
  };

  const handleQuickApprove = () => {
    if (!id) return;
    quickAccept(id, {
      onSuccess: () => toast({ variant: "success", title: "Approved", description: "An available resource was reserved automatically." }),
      onError: (e) => toast({ variant: "destructive", title: "Could not approve", description: getApiErrorMessage(e) }),
    });
  };

  const onReject = (data: { reason: string; comment?: string }) => {
    if (!id) return;
    reject({ id, payload: data }, { onSuccess: () => setShowRejectDialog(false) });
  };

  const handleRecordCondition = () => {
    if (!id || !selectedCondition) return;
    recordCondition(
      { id, condition: selectedCondition },
      {
        onSuccess: () => {
          toast({ variant: "success", title: "Arrival condition recorded" });
          setSelectedCondition("");
        },
        onError: (e) => toast({ variant: "destructive", title: "Could not record", description: getApiErrorMessage(e) }),
      }
    );
  };

  const handleArrangeTransport = () => {
    if (!id || !ambulanceId) return;
    arrangeTransport(
      { referral_id: id, ambulance_id: ambulanceId },
      {
        onSuccess: () => {
          toast({ variant: "success", title: "Transport arranged", description: "The receiving facility has been notified. The driver drives the rest from their app." });
          setAmbulanceId("");
        },
        onError: (e) => toast({ variant: "destructive", title: "Could not arrange transport", description: getApiErrorMessage(e) }),
      }
    );
  };

  const handleMarkArrived = () => {
    if (!id) return;
    markArrived(id, {
      onSuccess: () => toast({ variant: "success", title: "Marked as arrived", description: "The referring facility has been notified." }),
      onError: (e) => toast({ variant: "destructive", title: "Could not mark arrived", description: getApiErrorMessage(e) }),
    });
  };

  if (isLoading) {
    return (
      <div className="max-w-3xl space-y-6">
        <div className="h-8 w-48 rounded-lg shimmer" />
        <div className="grid gap-6 lg:grid-cols-2">
          {[1, 2].map((i) => <div key={i} className="h-48 rounded-xl border shimmer" />)}
        </div>
        <div className="h-40 rounded-xl border shimmer" />
      </div>
    );
  }

  if (!referral) return <p className="text-destructive">Transfer request not found</p>;

  const isPendingDecision =
    referral.status === "REQUESTED" || referral.status === "UNDER_REVIEW";

  const isInTransit =
    referral.status === "TRANSPORT_ARRANGED" ||
    referral.status === "EN_ROUTE" ||
    referral.status === "ARRIVED";

  // The latest transport record (if the referring clinician arranged one).
  const transport = referral.transport_events?.[referral.transport_events.length - 1] ?? null;
  // Only the referring hospital's own ambulances may be assigned (it runs the
  // transport). Scope the picker to the referral's referring facility regardless of
  // who's viewing (a super admin would otherwise see every facility's fleet).
  const assignableAmbulances = ambulances.filter(
    (a) => a.facility_id === referral.referring_facility_id
  );
  const receivingFacilityId = referral.accepted_facility_id ?? referral.preferred_facility_id;
  const myFacility = me?.active_facility_id ?? null;
  const myUnits = me?.unit_ids ?? [];

  // Which side of the transfer the current user is on. Super admins can act on both.
  const isReferringSide =
    isSuperAdmin ||
    referral.created_by === me?.id ||
    (!!referral.referring_facility_id && referral.referring_facility_id === myFacility) ||
    (!!referral.origin_unit_id && myUnits.includes(referral.origin_unit_id));
  const isReceivingSide =
    isSuperAdmin ||
    (!!receivingFacilityId && receivingFacilityId === myFacility) ||
    (!!referral.requested_unit_id && myUnits.includes(referral.requested_unit_id));

  // Phone coordination targets the counterparty hospital + its unit. A pure
  // receiving-side viewer calls the unit that submitted the request (origin unit);
  // otherwise (referring side or super admin) the requested destination unit.
  const callBackToReferrer = isReceivingSide && !isReferringSide;
  const callFacilityId = callBackToReferrer ? referral.referring_facility_id : receivingFacilityId;
  const callUnitId = callBackToReferrer ? referral.origin_unit_id : referral.requested_unit_id;
  const callUnitName = allUnits.find((u) => u.id === callUnitId)?.name;

  // Only the destination side may approve/reject, and never the clinician who sent
  // the request — mirrors the server-side guard so the buttons aren't shown in vain.
  const canAction =
    canAcceptReferral &&
    isPendingDecision &&
    isReceivingSide &&
    referral.created_by !== me?.id;

  // Only the receiving side records the patient's arrival condition — never the
  // sending clinician who raised the request (mirrors the server-side guard).
  const canRecordArrival =
    canAcceptReferral && isReceivingSide && referral.created_by !== me?.id;

  const TIMELINE_COLORS: Record<string, string> = {
    REQUESTED: "bg-blue-500",
    UNDER_REVIEW: "bg-amber-500",
    ACCEPTED: "bg-emerald-500",
    TRANSPORT_ARRANGED: "bg-violet-500",
    EN_ROUTE: "bg-indigo-500",
    ARRIVED: "bg-teal-500",
    REJECTED: "bg-rose-500",
    CANCELLED: "bg-gray-400",
  };

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{referral.referral_number}</h1>
            <StatusBadge status={referral.status} />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Created {formatDateTime(referral.created_at)}
          </p>
        </div>
        {transport && isInTransit && (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={() => navigate(`/transport/${referral.id}/track`)}
          >
            <Ambulance className="mr-2 h-4 w-4" />
            Track ambulance
          </Button>
        )}
      </div>

      {/* Info cards */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Patient Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Row
              label="Patient Name"
              value={
                String(
                  (referral.form_data?.patient_name as string) ||
                    (referral.form_data?.baby_name as string) ||
                    "—"
                )
              }
            />
            <Row label="Sex" value={referral.sex === "M" ? "Male" : "Female"} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Clinical Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Row label="Form" value={getFormDef(referral.form_type).label} />
            <Row label="Diagnosis" value={referral.diagnosis} />
            {referral.requested_resource_id && (
              <Row
                label="Requested Resource"
                value={referral.requested_resource_name ?? "—"}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Reason for Transfer</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed text-foreground/80">{referral.reason_for_transfer}</p>
        </CardContent>
      </Card>

      {/* Form-specific MoH fields — only the sections this form variant actually
          uses, so each unit's referral shows exactly what it captured. */}
      <DynamicFormDetails formType={referral.form_type} formData={referral.form_data} />

      {/* Patient Monitoring Transfer Form — recorded by the ambulance crew by voice
          during transport, shown read-only to both clinics and admins. */}
      <TransportMonitoringCard monitoring={referral.transport_monitoring} />

      {/* Voice referral — the referring clinician's recording, an AI summary, and the
          full transcript, so the receiving clinic can listen to the original handover. */}
      {(referral.audio_url || referral.ai_summary || referral.transcript) && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Sparkles className="h-4 w-4 text-primary" /> Voice Referral
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {referral.ai_summary && (
              <p className="text-sm leading-relaxed text-foreground/80">{referral.ai_summary}</p>
            )}
            {referral.audio_url && (
              <div className="space-y-1.5">
                <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Volume2 className="h-3.5 w-3.5" /> Original recording
                </p>
                <audio controls src={referral.audio_url} className="w-full" />
              </div>
            )}
            {referral.transcript && (
              <details className="text-sm">
                <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                  View full transcript
                </summary>
                <p className="mt-2 whitespace-pre-wrap leading-relaxed text-foreground/70">
                  {referral.transcript}
                </p>
              </details>
            )}
          </CardContent>
        </Card>
      )}

      {/* Coordinate by phone with the *other* hospital: the receiving side calls the
          hospital that submitted the request; the referring side calls the destination. */}
      <CallCoordinationCard
        referralId={referral.id}
        facilityId={callFacilityId}
        facilityName={facilities.find((f) => f.id === callFacilityId)?.name}
        unitId={callUnitId ?? undefined}
        unitName={callUnitName}
      />

      {/* Transport — arranged by the referring clinician (their hospital's ambulance).
          The receiving clinician can confirm arrival when no tracked transport is used. */}
      {(referral.status === "ACCEPTED" || isInTransit) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Truck className="h-4 w-4 text-primary" />
              Transport
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Existing transport details + driver-driven journey progress */}
            {transport && (
              <div className="space-y-1.5 rounded-lg bg-muted/40 p-3 text-sm">
                <Row label="Ambulance" value={transport.ambulance_identifier} />
                {transport.driver_name && <Row label="Driver" value={transport.driver_name} />}
                {transport.driver_phone && <Row label="Driver phone" value={transport.driver_phone} />}
                {transport.dispatch_time && <Row label="Journey started" value={formatDateTime(transport.dispatch_time)} />}
                {transport.pickup_time && <Row label="Patient picked up" value={formatDateTime(transport.pickup_time)} />}
                {transport.arrival_time && <Row label="Arrived" value={formatDateTime(transport.arrival_time)} />}
                {!transport.arrival_time && (
                  <p className="pt-1 text-[11px] text-muted-foreground">
                    The driver advances the journey (start → picked up → arrived) from their phone app.
                  </p>
                )}
                {/* Call the ambulance crew in-app; the referring side can also swap the
                    assigned ambulance until the driver starts the journey. */}
                {!transport.arrival_time && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {transport.ambulance_id && (
                      <CallButton
                        facilityId={null}
                        ambulanceId={transport.ambulance_id}
                        ambulanceLabel={`Ambulance ${transport.ambulance_identifier}`}
                        referralId={referral.id}
                        label="Call ambulance"
                        variant="outline"
                        size="sm"
                      />
                    )}
                    {isReferringSide && !transport.dispatch_time && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        disabled={removing}
                        onClick={() =>
                          removeTransport(referral.id, {
                            onSuccess: () => toast({ variant: "success", title: "Ambulance removed — assign another" }),
                            onError: (e) => toast({ variant: "destructive", title: "Could not remove ambulance", description: getApiErrorMessage(e) }),
                          })
                        }
                      >
                        {removing ? "Removing…" : "Remove ambulance"}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Referring clinician: assign an available ambulance when accepted */}
            {isReferringSide && referral.status === "ACCEPTED" && !transport && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Assign one of your hospital's available ambulances. The driver signs into their
                  phone app and drives the journey; the receiving facility is notified.
                  If no ambulance is used, the receiving facility can confirm arrival instead.
                </p>
                <div className="space-y-1.5">
                  <Label className="text-xs">Available ambulance</Label>
                  <Select value={ambulanceId} onValueChange={setAmbulanceId}>
                    <SelectTrigger>
                      <SelectValue placeholder={assignableAmbulances.length ? "Select an ambulance" : "No ambulances available"} />
                    </SelectTrigger>
                    <SelectContent>
                      {assignableAmbulances.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.plate_number}{a.driver_name ? ` — ${a.driver_name}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleArrangeTransport} disabled={!ambulanceId || arranging}>
                  <Truck className="mr-2 h-4 w-4" />
                  {arranging ? "Arranging…" : "Arrange transport"}
                </Button>
              </div>
            )}

            {isReceivingSide && referral.status === "ACCEPTED" && (
              <div className="space-y-2 border-t pt-3">
                <p className="text-xs text-muted-foreground">
                  Confirm arrival once the patient reaches your facility — the referring facility will be notified.
                </p>
                <Button variant="outline" onClick={handleMarkArrived} disabled={markingArrived}>
                  <Check className="mr-2 h-4 w-4" />
                  {markingArrived ? "Saving…" : "Mark patient arrived"}
                </Button>
              </div>
            )}

            {/* Both sides can follow / replay the journey when there's a tracked ambulance */}
            {transport && isInTransit && (
              <Button variant="outline" onClick={() => navigate(`/transport/${referral.id}/track`)}>
                <Ambulance className="mr-2 h-4 w-4" />
                Track ambulance
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {referral.rejection_reason && (
        <Card className="border-rose-200 bg-rose-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-rose-700">Rejection Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Row label="Reason" value={referral.rejection_reason.replace(/_/g, " ")} />
            {referral.rejection_comment && <Row label="Comment" value={referral.rejection_comment} />}
          </CardContent>
        </Card>
      )}

      {/* Arrival condition — recorded by the receiving clinician on arrival */}
      {(referral.status === "ARRIVED" || referral.arrival_condition) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Ambulance className="h-4 w-4 text-primary" />
              Patient Arrival Condition
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {referral.arrival_condition ? (
              <span
                className={cn(
                  "inline-flex rounded-full px-3 py-1 text-sm font-medium",
                  ARRIVAL_CONDITION_STYLES[referral.arrival_condition as ArrivalCondition] ??
                    "bg-muted text-foreground"
                )}
              >
                {arrivalConditionLabel(referral.arrival_condition)}
              </span>
            ) : canRecordArrival ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-1.5">
                  <Label className="text-sm font-medium">Record how the patient arrived</Label>
                  <Select onValueChange={(v) => setSelectedCondition(v as ArrivalCondition)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select condition…" />
                    </SelectTrigger>
                    <SelectContent>
                      {ARRIVAL_CONDITIONS.map((c) => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleRecordCondition} disabled={!selectedCondition || recordingCondition}>
                  <Check className="mr-2 h-4 w-4" />
                  {recordingCondition ? "Saving…" : "Record condition"}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Not yet recorded.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Referral Feedback & Counter-Referral — filled by the receiving facility once
          the transfer is accepted; read-only for the referring side. */}
      <ReferralFeedbackSection
        referral={referral}
        canEdit={canRecordArrival && (referral.status === "ACCEPTED" || isInTransit)}
      />

      {/* Status Timeline */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-primary" />
            Status Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          {referral.status_history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No history yet</p>
          ) : (
            <ol className="relative ml-3 space-y-5 border-l-2 border-border/60">
              {referral.status_history.map((h, idx) => (
                <li key={h.id} className="ml-5">
                  <div
                    className={cn(
                      "absolute -left-[9px] flex h-4 w-4 items-center justify-center rounded-full ring-2 ring-background",
                      TIMELINE_COLORS[h.status] ?? "bg-gray-400",
                      idx === 0 && "ring-primary/20 ring-4"
                    )}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={h.status} />
                    <span className="text-xs text-muted-foreground">{formatDateTime(h.created_at)}</span>
                  </div>
                  {h.comment && (
                    <p className="mt-1 text-xs text-muted-foreground italic">"{h.comment}"</p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      {/* Action bar */}
      {canAction && (
        <div className="space-y-3 rounded-xl border border-border/60 bg-card p-4 shadow-card">
          {/* One-click approve for fast decisions */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Provide Decision</p>
              <p className="text-xs text-muted-foreground">
                Approve auto-reserves an available resource in the requested unit at your facility.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleQuickApprove}
                disabled={quickAccepting}
                className="bg-primary text-white hover:brightness-110 shadow-sm"
              >
                <Zap className="mr-2 h-4 w-4" />
                {quickAccepting ? "Approving…" : "Approve"}
              </Button>
              <Button variant="destructive" onClick={() => setShowRejectDialog(true)}>
                <X className="mr-2 h-4 w-4" />
                Reject
              </Button>
            </div>
          </div>

          {/* Or pick a specific resource manually */}
          <div className="flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label className="text-sm font-medium">Or choose a specific resource</Label>
              <Select onValueChange={setSelectedResourceId}>
                <SelectTrigger>
                  <SelectValue placeholder={availableResources.length > 0 ? "Choose a resource…" : "No resources available"} />
                </SelectTrigger>
                <SelectContent>
                  {availableResources.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.resource_code ?? r.resource_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleAccept} disabled={!selectedResourceId || accepting} variant="outline">
              <Check className="mr-2 h-4 w-4" />
              {accepting ? "Approving…" : "Approve with selected"}
            </Button>
          </div>
        </div>
      )}

      {/* Reject dialog */}
      <RejectDialog open={showRejectDialog} onOpenChange={setShowRejectDialog} onSubmit={onReject} isSubmitting={rejecting} />
    </div>
  );
};
