import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useReferral, useAcceptReferral, useQuickAcceptReferral, useRejectReferral } from "@/hooks/useReferrals";
import { useResources } from "@/hooks/useResources";
import { toast } from "@/components/ui/toaster";
import { getApiErrorMessage } from "@/utils/apiError";
import { Zap } from "lucide-react";
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
import { ArrowLeft, Check, X, Clock } from "lucide-react";
import { formatDateTime } from "@/utils/format";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/utils/cn";
import RejectDialog from "./RejectDialog";

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex gap-3">
    <span className="w-36 shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
    <span className="text-sm font-medium text-foreground">{value}</span>
  </div>
);

export const ReferralDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { canAcceptReferral } = usePermissions();
  const { data: referral, isLoading } = useReferral(id!);
  const { data: resources = [] } = useResources();
  const { mutate: accept, isPending: accepting } = useAcceptReferral();
  const { mutate: quickAccept, isPending: quickAccepting } = useQuickAcceptReferral();
  const { mutate: reject, isPending: rejecting } = useRejectReferral();
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [selectedResourceId, setSelectedResourceId] = useState("");

  const availableResources = resources.filter((r) => r.status === "AVAILABLE");

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

  const canAction =
    canAcceptReferral &&
    (referral.status === "REQUESTED" || referral.status === "UNDER_REVIEW");

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
      </div>

      {/* Info cards */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Patient Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Row label="Patient Code" value={referral.patient_code} />
            <Row label="Age Band" value={referral.age_band} />
            <Row label="Sex" value={referral.sex === "M" ? "Male" : "Female"} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Clinical Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Row label="Diagnosis" value={referral.diagnosis} />
            <Row label="Acuity Level" value={referral.acuity_level} />
            <Row label="Urgency" value={referral.urgency.replace(/_/g, " ")} />
            <Row label="Ventilator" value={referral.ventilator_needed ? "Required" : "Not required"} />
            <Row label="High-flow O₂" value={referral.high_flow_oxygen_needed ? "Required" : "Not required"} />
            {referral.comorbidities && <Row label="Comorbidities" value={referral.comorbidities} />}
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
              <p className="text-sm font-medium">Quick decision</p>
              <p className="text-xs text-muted-foreground">
                Approve auto-reserves an available resource in the requested unit at your facility.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleQuickApprove}
                disabled={quickAccepting}
                className="bg-gradient-to-r from-emerald-500 to-green-600 text-white hover:brightness-110 shadow-sm"
              >
                <Zap className="mr-2 h-4 w-4" />
                {quickAccepting ? "Approving…" : "Quick Approve"}
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
