import { useState } from "react";
import { Phone } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFacilities } from "@/hooks/useFacilities";
import { useUnits } from "@/hooks/useUnits";
import { useCall } from "./call-context";

/** Header entry point: pick a hospital and a clinical unit, then call that unit in-app
 *  — a directory call not tied to a referral. Clinicians in that unit answer. */
export const DirectoryCallDialog = () => {
  const [open, setOpen] = useState(false);
  const [facilityId, setFacilityId] = useState<string>("");
  const [unitId, setUnitId] = useState<string>("");
  const { data: facilities = [] } = useFacilities();
  // Units are loaded for the chosen facility (tier-eligible), not the global catalog.
  const { data: units = [] } = useUnits({ facility_id: facilityId }, { enabled: !!facilityId });
  const { startCall, busy } = useCall();

  const facility = facilities.find((f) => f.id === facilityId);
  const unit = units.find((u) => u.id === unitId);

  // Reset the unit whenever the facility changes — its unit list differs.
  const onFacilityChange = (id: string) => {
    setFacilityId(id);
    setUnitId("");
  };

  const onCall = () => {
    if (!facility || !unit) return;
    setOpen(false);
    startCall({ facilityId: facility.id, facilityName: facility.name, unitId: unit.id, unitName: unit.name });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Call a hospital's emergency desk"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-foreground/70 transition-colors hover:bg-muted"
      >
        <Phone className="h-5 w-5" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Call a clinical unit</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Hospital</Label>
              <Select value={facilityId} onValueChange={onFacilityChange}>
                <SelectTrigger><SelectValue placeholder="Select a hospital" /></SelectTrigger>
                <SelectContent>
                  {facilities.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Clinical unit</Label>
              <Select value={unitId} onValueChange={setUnitId} disabled={!facilityId}>
                <SelectTrigger>
                  <SelectValue placeholder={facilityId ? "Select a unit" : "Select a hospital first"} />
                </SelectTrigger>
                <SelectContent>
                  {units.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              The call rings the clinicians who work in that unit; the first to answer connects.
            </p>
            <Button type="button" className="w-full" disabled={!facility || !unit || busy} onClick={onCall}>
              <Phone className="mr-1.5 h-4 w-4" /> Call unit
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
