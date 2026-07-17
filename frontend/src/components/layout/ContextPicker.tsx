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
import { useAuthStore } from "@/store/auth.store";
import { useSwitchContext } from "@/hooks/useAuth";
import { useWorkContext } from "@/hooks/useWorkContext";
import logo from "@/assets/ebuzimaTransfer.svg";

/**
 * Blocking post-login step shown when the signed-in user could be working in more
 * than one facility or clinical unit. They pick where they're working right now; the
 * choice is applied via switch-context and can be changed later from the header.
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/95 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md animate-fade-in rounded-2xl border border-border/60 bg-card p-6 shadow-xl sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <img alt="eBuzimaTransfer" width="44" height="44" src={logo} />
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Where are you working{user?.first_name ? `, ${user.first_name}` : ""}?
            </h2>
            <p className="text-sm text-muted-foreground">
              Pick the facility and unit you're in. You can switch anytime from the top bar.
            </p>
          </div>
        </div>

        <div className="space-y-5">
          {multipleFacilities && (
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-sm">
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
              <Label className="flex items-center gap-1.5 text-sm">
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

          <Button className="w-full" size="lg" onClick={confirm} disabled={isPending || !facilityId}>
            {isPending ? "Setting up…" : "Continue"}
          </Button>
        </div>
      </div>
    </div>
  );
};
