import { Phone, PhoneCall } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { usePhoneLines, useCalls, useLogCall } from "@/hooks/useCalls";
import { toast } from "@/components/ui/toaster";
import { formatDateTime } from "@/utils/format";
import type { PhoneLine } from "@/types/call";

const TYPE_LABELS: Record<string, string> = {
  EMERGENCY: "Emergency",
  COORDINATION: "Coordination",
  SUPERVISOR: "Supervisor",
  TOLLFREE: "Toll-free",
  DISPATCH: "Dispatch",
  OTHER: "Other",
};

interface Props {
  referralId: string;
  facilityId: string | null;
  facilityName?: string;
}

export const CallCoordinationCard = ({ referralId, facilityId, facilityName }: Props) => {
  const { data: lines = [] } = usePhoneLines(facilityId ?? undefined);
  const { data: calls = [] } = useCalls(referralId);
  const { mutate: log } = useLogCall();

  if (!facilityId) return null;

  const call = (line: PhoneLine) => {
    // Place the call via the device dialer to the institutional line, and log it.
    window.location.assign(`tel:${line.phone_number.replace(/\s+/g, "")}`);
    log(
      {
        referral_id: referralId,
        to_facility_id: facilityId,
        from_line_id: line.id,
        to_number: line.phone_number,
        purpose: "Confirm resource availability",
      },
      {
        onSuccess: () => toast({ variant: "success", title: "Call logged", description: `${line.label} · ${line.phone_number}` }),
      }
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <PhoneCall className="h-4 w-4 text-primary" />
          Coordinate by phone {facilityName ? `· ${facilityName}` : ""}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">No institutional lines configured for this facility.</p>
        ) : (
          <ul className="divide-y">
            {lines.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 py-2">
                <div>
                  <p className="text-sm font-medium">{l.label}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {l.phone_number} · {TYPE_LABELS[l.line_type] ?? l.line_type}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => call(l)}>
                  <Phone className="mr-1.5 h-3.5 w-3.5" /> Call
                </Button>
              </li>
            ))}
          </ul>
        )}

        {calls.length > 0 && (
          <div className="border-t pt-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Call history</p>
            <ul className="space-y-1.5">
              {calls.map((c) => (
                <li key={c.id} className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{c.placed_by_name ?? "Someone"}</span> called{" "}
                  <span className="font-mono">{c.to_number}</span>
                  {c.from_line_label ? ` (${c.from_line_label})` : ""} · {formatDateTime(c.created_at)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
