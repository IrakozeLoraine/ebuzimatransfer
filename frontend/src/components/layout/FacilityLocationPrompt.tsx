import { useState } from "react";
import { MapPin, LocateFixed } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/usePermissions";
import { useFacilities, useSetFacilityLocation } from "@/hooks/useFacilities";
import { useAuthStore } from "@/store/auth.store";

/**
 * Prompts a facility admin to pin their facility's location the first time they
 * sign in (i.e. whenever their active facility still has no coordinates), by
 * sharing the device's current position. Coordinates power the ambulance map and
 * route planning, so we ask for them up front.
 */
export const FacilityLocationPrompt = () => {
  const { isFacilityAdmin } = usePermissions();
  const activeFacilityId = useAuthStore((s) => s.user?.active_facility_id ?? null);
  const { data: facilities = [] } = useFacilities();
  const { mutate: saveLocation, isPending } = useSetFacilityLocation();

  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const facility = facilities.find((f) => f.id === activeFacilityId) ?? null;
  const needsLocation =
    isFacilityAdmin &&
    !!facility &&
    (facility.latitude == null || facility.longitude == null);

  const open = needsLocation && !dismissed;

  const enableLocation = () => {
    setError(null);
    if (!("geolocation" in navigator)) {
      setError("Location isn't supported on this device.");
      return;
    }
    if (!window.isSecureContext) {
      setError("Location needs a secure (HTTPS) connection. Open this site over https:// to pin your facility.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!facility) return;
        saveLocation({
          id: facility.id,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
      },
      (err) => {
        setError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission denied. Allow location access in your browser, then try again."
            : err.message || "Couldn't get your location."
        );
      },
      { enableHighAccuracy: true, timeout: 20_000 }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && setDismissed(true)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Set your facility's location
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {facility?.name ?? "Your facility"} doesn't have a location yet. Pin it by sharing your
            current position — this is used to plot ambulance routes and live tracking. Do this while
            you're physically at the facility for the best accuracy.
          </p>
          {error && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {error}
            </div>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => setDismissed(true)} disabled={isPending}>
              Not now
            </Button>
            <Button onClick={enableLocation} disabled={isPending}>
              <LocateFixed className="mr-2 h-4 w-4" />
              {isPending ? "Saving…" : "Use my current location"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
