import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/responsive-dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { useFacilities } from "@/hooks/useFacilities";
import { usePermissions } from "@/hooks/usePermissions";
import { useAssignResources } from "@/hooks/useResources";
import { useUnits } from "@/hooks/useUnits";
import { useAuthStore } from "@/store/auth.store";
import { Resource } from "@/types/resource";
import { getApiErrorMessage } from "@/utils/apiError";
import { useState } from "react";

export default function AssignDialog({
    resources,
    onClose,
}: {
    resources: Resource[];
    onClose: () => void;
}) {
    const { isSuperAdmin } = usePermissions();
    const user = useAuthStore((s) => s.user);
    const { data: facilities = [] } = useFacilities();
    const { mutate: assign, isPending } = useAssignResources();

    const open = resources.length > 0;
    const count = resources.length;
    const single = count === 1 ? resources[0] : null;

    // Facility admins can never move a resource to a different facility — the target
    // facility is fixed to the resources' own facility and they only set the unit.
    const adminFacilityId =
        resources[0]?.facility_id ?? user?.active_facility_id ?? user?.facilities?.[0]?.id ?? "";

    const [facilityId, setFacilityId] = useState<string>("");
    const [unitId, setUnitId] = useState<string>("");

    // Reset selections whenever the targeted set of resources changes (React's
    // "adjust state while rendering" pattern — previous key kept in state).
    const targetKey = resources.map((r) => r.id).join(",");
    const [lastKey, setLastKey] = useState<string>("");
    if (targetKey !== lastKey) {
        setLastKey(targetKey);
        setFacilityId(isSuperAdmin ? (single?.facility_id ?? "") : adminFacilityId);
        setUnitId(single?.unit_id ?? "");
    }

    // Units are derived from the target facility's tier (cascading catalog).
    const unitFacilityId = isSuperAdmin ? facilityId : adminFacilityId;
    const { data: facilityUnits = [] } = useUnits(
        { facility_id: unitFacilityId || undefined },
        { enabled: !!unitFacilityId }
    );

    const handleAssign = () => {
        if (!resources.length) return;
        assign(
            {
                resource_ids: resources.map((r) => r.id),
                // Super admins pick the facility (empty = central stock); facility admins
                // keep the resources in their own facility, server-enforced.
                facility_id: isSuperAdmin ? facilityId || null : adminFacilityId,
                unit_id: unitId || null,
            },
            {
                onSuccess: () => {
                    toast({
                        variant: "success",
                        title:
                            count > 1
                                ? `${count} resources updated`
                                : facilityId || !isSuperAdmin
                                ? "Resource assigned"
                                : "Returned to stock",
                    });
                    onClose();
                },
                onError: (e) =>
                    toast({ variant: "destructive", title: "Could not assign resource", description: getApiErrorMessage(e) }),
            }
        );
    };

    const title = !isSuperAdmin
        ? count > 1 ? `Move ${count} resources to a unit` : "Move resource to a unit"
        : single
        ? single.facility_id ? "Transfer Resource" : "Assign Resource"
        : `Transfer ${count} resources`;

    // Facility admins must pick a unit; super admins may save (incl. return to stock).
    const saveDisabled = isPending || (!isSuperAdmin && !unitId);

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                </DialogHeader>
                {open && (
                    <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                            {single ? single.resource_name : `${count} resources selected`}
                        </p>

                        {/* Only super admins choose a facility; facility admins are locked to theirs. */}
                        {isSuperAdmin && (
                            <div className="space-y-1.5">
                                <Label>Facility</Label>
                                <Select
                                    value={facilityId}
                                    onValueChange={(v) => {
                                        setFacilityId(v);
                                        setUnitId("");
                                    }}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select a facility" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {facilities.map((f) => (
                                            <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        <div className="space-y-1.5">
                            <Label>
                                Unit{" "}
                                {isSuperAdmin && <span className="text-muted-foreground text-xs">(optional)</span>}
                            </Label>
                            <Select value={unitId} onValueChange={setUnitId} disabled={!unitFacilityId}>
                                <SelectTrigger>
                                    <SelectValue placeholder={unitFacilityId ? "Select a unit" : "Select a facility first"} />
                                </SelectTrigger>
                                <SelectContent>
                                    {facilityUnits.map((u) => (
                                        <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="flex justify-between gap-2 pt-1">
                            {/* Returning to central stock is a super-admin-only action. */}
                            {isSuperAdmin ? (
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        setFacilityId("");
                                        setUnitId("");
                                    }}
                                    disabled={!facilityId && !unitId}
                                >
                                    Return to stock
                                </Button>
                            ) : (
                                <span />
                            )}
                            <div className="flex gap-2">
                                <Button variant="outline" onClick={onClose}>Cancel</Button>
                                <Button onClick={handleAssign} disabled={saveDisabled}>
                                    {isPending ? "Saving…" : "Save"}
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
};
