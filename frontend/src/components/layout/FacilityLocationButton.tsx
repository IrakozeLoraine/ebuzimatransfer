import { useState } from "react";
import { MapPin } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { useFacilities } from "@/hooks/useFacilities";
import { useAuthStore } from "@/store/auth.store";
import { FacilityLocationDialog } from "./FacilityLocationDialog";

/**
 * Navbar control for facility admins to set/update their facility's location. Shows
 * an amber dot when the facility still has no coordinates, so it nudges without
 * blocking the app on every refresh.
 */
export const FacilityLocationButton = () => {
  const { isFacilityAdmin } = usePermissions();
  const activeFacilityId = useAuthStore((s) => s.user?.active_facility_id ?? null);
  const { data: facilities = [] } = useFacilities();
  const [open, setOpen] = useState(false);

  if (!isFacilityAdmin) return null;
  const facility = facilities.find((f) => f.id === activeFacilityId) ?? null;
  if (!facility) return null;

  const needsLocation = facility.latitude == null || facility.longitude == null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={needsLocation ? "Set your facility's location" : "Update your facility's location"}
        title={needsLocation ? "Set your facility's location" : "Facility location set"}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-foreground/70 transition-colors hover:bg-muted"
      >
        <MapPin className="h-5 w-5" />
        {needsLocation && (
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-white dark:ring-background" />
        )}
      </button>
      <FacilityLocationDialog open={open} onOpenChange={setOpen} />
    </>
  );
};
