import { useMemo, useState } from "react";
import { Building2, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AuthShell } from "./AuthShell";
import { useAuthStore } from "@/store/auth.store";
import { useSwitchContext } from "@/hooks/useAuth";
import { useWorkContext } from "@/hooks/useWorkContext";

/**
 * Blocking post-login step shown when the signed-in user could be working in more
 * than one facility or clinical unit. They pick where they're working right now; the
 * choice is applied via switch-context and can be changed later from the header. It
 * reuses the login screen's shell so the sign-in flow reads as one continuous journey.
 */
export const ContextPicker = () => {
  const user = useAuthStore((s) => s.user);
  const { facilities, activeFacilityId, activeUnitId, unitsForFacility } = useWorkContext();
  const { mutate: switchContext, isPending } = useSwitchContext();

  const [facilityId, setFacilityId] = useState<string>(activeFacilityId ?? facilities[0]?.id ?? "");

  const units = useMemo(() => unitsForFacility(facilityId), [unitsForFacility, facilityId]);
  const [unitId, setUnitId] = useState<string>(() =>
    units.some((u) => u.id === activeUnitId) ? (activeUnitId as string) : units[0]?.id ?? ""
  );

  // When the facility changes, its units change too — reset to that facility's first unit.
  const onFacilityChange = (id: string) => {
    setFacilityId(id);
    const next = unitsForFacility(id);
    setUnitId(next[0]?.id ?? "");
  };

  const multipleFacilities = facilities.length > 1;
  const multipleUnits = units.length > 1;

  const confirm = () => {
    if (!facilityId) return;
    switchContext({ facilityId, unitId: unitId || null });
  };

  return (
    <AuthShell>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-foreground">
          Where are you working{user?.first_name ? `, ${user.first_name}` : ""}?
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick the facility and unit you're in. You can switch anytime from the top bar.
        </p>
      </div>

      <div className="space-y-4">
        {multipleFacilities && (
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-sm font-medium">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              Facility
            </Label>
            <Select value={facilityId} onValueChange={onFacilityChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select a facility" />
              </SelectTrigger>
              <SelectContent>
                {facilities.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {multipleUnits && (
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-sm font-medium">
              <LayoutGrid className="h-4 w-4 text-muted-foreground" />
              Clinical unit
            </Label>
            <Select value={unitId} onValueChange={setUnitId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a unit" />
              </SelectTrigger>
              <SelectContent>
                {units.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <Button
          className="w-full mt-2"
          size="lg"
          onClick={confirm}
          disabled={isPending || !facilityId}
        >
          {isPending ? "Setting up…" : "Continue"}
        </Button>
      </div>
    </AuthShell>
  );
};
