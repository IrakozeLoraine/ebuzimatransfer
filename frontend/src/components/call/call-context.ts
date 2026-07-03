import { createContext, useContext } from "react";

/** A call target: a clinical unit at a hospital (its clinicians are rung). When
 *  ``unitId`` is omitted the whole-facility desk is rung. */
export interface CallTarget {
  facilityId: string;
  facilityName?: string;
  unitId?: string;
  unitName?: string;
  /** When set, the call rings this ambulance's driver app instead of a unit. */
  ambulanceId?: string;
  ambulanceLabel?: string;
}

export interface CallContextValue {
  /** Call a clinical unit at a receiving hospital, optionally tied to a referral. */
  startCall: (target: CallTarget, referralId?: string) => void;
  busy: boolean;
}

export const CallContext = createContext<CallContextValue>({ startCall: () => {}, busy: false });

export const useCall = () => useContext(CallContext);
