import { useMemo } from "react";
import { useAuthStore } from "@/store/auth.store";
import type { FacilityRef, UnitRef } from "@/types/auth";

/**
 * Derives the facility/unit "working context" for the signed-in user from the
 * cached profile: which facilities they belong to, which clinical units they work
 * in at a given facility, and whether that choice is ambiguous enough to prompt for.
 */
export const useWorkContext = () => {
  const user = useAuthStore((s) => s.user);

  return useMemo(() => {
    const facilities: FacilityRef[] = user?.facilities ?? [];
    const activeFacilityId = user?.active_facility_id ?? null;
    const activeUnitId = user?.active_unit_id ?? null;

    const unitsForFacility = (facilityId: string | null): UnitRef[] => {
      if (!facilityId) return [];
      return user?.facility_roles.find((fr) => fr.facility.id === facilityId)?.units ?? [];
    };

    const activeFacility = facilities.find((f) => f.id === activeFacilityId) ?? null;
    const unitsForActiveFacility = unitsForFacility(activeFacilityId);
    const activeUnit = unitsForActiveFacility.find((u) => u.id === activeUnitId) ?? null;

    // The user should consciously pick a context when there is more than one facility
    // to choose from, or more than one unit at the facility they're resolved into.
    const needsSelection = facilities.length > 1 || unitsForActiveFacility.length > 1;

    return {
      facilities,
      activeFacilityId,
      activeFacility,
      activeUnitId,
      activeUnit,
      unitsForActiveFacility,
      unitsForFacility,
      needsSelection,
    };
  }, [user]);
};
