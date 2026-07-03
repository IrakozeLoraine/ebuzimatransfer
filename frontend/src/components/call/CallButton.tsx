import { Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCall } from "./CallProvider";

interface Props {
  /** The receiving hospital whose unit will be called. */
  facilityId: string | null;
  facilityName?: string;
  /** The clinical unit to call; its clinicians are rung. Omit for the facility desk. */
  unitId?: string;
  unitName?: string;
  /** When set, rings this ambulance's driver app instead of a unit. */
  ambulanceId?: string;
  ambulanceLabel?: string;
  /** Tie the call to a referral when started from a case. */
  referralId?: string;
  label?: string;
  variant?: "default" | "outline" | "link";
  size?: "default" | "sm";
}

/** Places an in-app voice call to a clinical unit (its clinicians answer) or, when
 *  ``ambulanceId`` is given, to a facility's ambulance (the driver app answers). */
export const CallButton = ({ facilityId, facilityName, unitId, unitName, ambulanceId, ambulanceLabel, referralId, label = "Call", variant = "link", size = "sm" }: Props) => {
  const { startCall, busy } = useCall();
  if (!facilityId && !ambulanceId) return null;
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      disabled={busy}
      onClick={() => startCall({ facilityId: facilityId ?? "", facilityName, unitId, unitName, ambulanceId, ambulanceLabel }, referralId)}
    >
      <Phone className="mr-1.5 h-3.5 w-3.5" /> {label}
    </Button>
  );
};
