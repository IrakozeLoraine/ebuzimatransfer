import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/responsive-dialog";
import { Input } from "@/components/ui/input";
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

    // Units that can be moved right now: central stock is wholly assignable, any
    // assigned group only down to its available (free) units.
    const movableOf = (r: Resource) =>
        r.facility_id == null && r.unit_id == null ? r.quantity : r.available;
    const singleMovable = single ? movableOf(single) : 0;

    const [facilityId, setFacilityId] = useState<string>("");
    const [unitId, setUnitId] = useState<string>("");
    const [quantity, setQuantity] = useState<string>("");

    // Reset selections whenever the targeted set of resources changes (React's
    // "adjust state while rendering" pattern — previous key kept in state).
    const targetKey = resources.map((r) => r.id).join(",");
    const [lastKey, setLastKey] = useState<string>("");
    if (targetKey !== lastKey) {
        setLastKey(targetKey);
        setFacilityId(isSuperAdmin ? (single?.facility_id ?? "") : adminFacilityId);
        setUnitId(single?.unit_id ?? "");
        // Default to moving everything for a single resource; one-at-a-time for a batch.
        setQuantity(single ? String(Math.max(1, singleMovable)) : "1");
    }

    // Units are derived from the target facility's tier (cascading catalog).
    const unitFacilityId = isSuperAdmin ? facilityId : adminFacilityId;
    const { data: facilityUnits = [] } = useUnits(
        { facility_id: unitFacilityId || undefined },
        { enabled: !!unitFacilityId }
    );

    const parsedQty = parseInt(quantity, 10);
    const qty = Number.isFinite(parsedQty) && parsedQty > 0 ? parsedQty : null;

    // A transfer to the resource's current facility *and* unit is a no-op — block it.
    const targetFacilityId = isSuperAdmin ? facilityId || null : adminFacilityId;
    const targetUnitId = unitId || null;
    const sameLocation =
        single != null &&
        targetFacilityId === (single.facility_id ?? null) &&
        targetUnitId === (single.unit_id ?? null);

    const handleAssign = () => {
        if (!resources.length) return;
        assign(
            {
                resource_ids: resources.map((r) => r.id),
                // Super admins pick the facility (empty = central stock); facility admins
                // keep the resources in their own facility, server-enforced.
                facility_id: isSuperAdmin ? facilityId || null : adminFacilityId,
                unit_id: unitId || null,
                quantity: qty,
            },
            {
                onSuccess: (moved) => {
                    const movedCount = moved.length;
                    toast({
                        variant: movedCount === 0 ? "destructive" : "success",
                        title:
                            count > 1
                                ? movedCount < count
                                    ? `${movedCount} of ${count} resources updated`
                                    : `${count} resources updated`
                                : movedCount === 0
                                ? "No units available to move"
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

    // Assigning a resource to a facility always requires a unit; only a super-admin
    // return to central stock (no target facility) may omit it.
    const needsUnit = !!targetFacilityId;
    // A quantity is always required, and for a single resource it can't exceed what's movable.
    const saveDisabled =
        isPending ||
        (needsUnit && !unitId) ||
        qty === null ||
        sameLocation ||
        (single != null && (singleMovable < 1 || qty > singleMovable));

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
                                {!needsUnit && <span className="text-muted-foreground text-xs">(optional)</span>}
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

                        <div className="space-y-1.5">
                            <Label>Quantity</Label>
                            <Input
                                type="number"
                                min={1}
                                max={single ? singleMovable : undefined}
                                value={quantity}
                                onChange={(e) => setQuantity(e.target.value)}
                            />
                            <p className="text-xs text-muted-foreground">
                                {single
                                    ? `${singleMovable} unit${singleMovable === 1 ? "" : "s"} available to move`
                                    : "Applied to each selected resource (capped at what each has available)"}
                            </p>
                        </div>

                        {sameLocation && (
                            <p className="text-xs text-amber-600">
                                Pick a different facility or unit — this resource is already there.
                            </p>
                        )}

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
