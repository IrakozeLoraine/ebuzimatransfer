import { PhoneCall } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useInAppCalls } from "@/hooks/useInAppCalls";
import { CallButton } from "@/components/call/CallButton";
import { formatDateTime } from "@/utils/format";

const CALL_STATUS_LABEL: Record<string, string> = {
  RINGING: "Ringing", ONGOING: "Ongoing", ENDED: "Completed",
  DECLINED: "Declined", MISSED: "Missed", CANCELLED: "Cancelled",
};

interface Props {
  /** Null when coordinating before a referral exists (call-first on the new request). */
  referralId: string | null;
  facilityId: string | null;
  facilityName?: string;
  /** The counterpart clinical unit to call; its clinicians are rung. */
  unitId?: string;
  unitName?: string;
}

/** Coordinate with the counterpart unit by an in-app voice call to its clinicians,
 *  with a history of the case's in-app calls. */
export const CallCoordinationCard = ({ referralId, facilityId, facilityName, unitId, unitName }: Props) => {
  const { data: calls = [] } = useInAppCalls(referralId ?? undefined);

  if (!facilityId) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <PhoneCall className="h-4 w-4 text-primary" />
          Coordinate by call {facilityName ? `· ${facilityName}` : ""}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <div>
            <p className="text-sm font-medium">Call the {unitName ? `${unitName} unit` : "unit"}</p>
            <p className="text-xs text-muted-foreground">Reach the clinicians working in this unit — in-app voice call.</p>
          </div>
          <CallButton facilityId={facilityId} facilityName={facilityName} unitId={unitId} unitName={unitName} referralId={referralId ?? undefined} label="Call" variant="default" />
        </div>

        {calls.length > 0 && (
          <div className="border-t pt-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Call history</p>
            <ul className="space-y-1.5">
              {calls.map((c) => (
                <li key={c.id} className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{c.caller_name ?? "Someone"}</span>
                  {" → "}
                  <span className="font-medium text-foreground">{c.callee_facility_name ?? "emergency desk"}</span>
                  {c.callee_name ? ` (${c.callee_name})` : ""}
                  {" · "}{CALL_STATUS_LABEL[c.status] ?? c.status} · {formatDateTime(c.created_at)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
