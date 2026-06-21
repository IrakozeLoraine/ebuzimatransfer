import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { useFacilities } from "@/hooks/useFacilities";
import { useAssignResource } from "@/hooks/useResources";
import { useUnits } from "@/hooks/useUnits";
import { Resource } from "@/types/resource";
import { getApiErrorMessage } from "@/utils/apiError";
import { useRef, useState } from "react";

export default function AssignDialog({
    resource,
    onClose,
}: {
    resource: Resource | null;
    onClose: () => void;
}) {
    const { data: facilities = [] } = useFacilities();
    const { mutate: assign, isPending } = useAssignResource();
    const [facilityId, setFacilityId] = useState<string>("");
    const [unitId, setUnitId] = useState<string>("");

    // Reset selections whenever a new resource is targeted.
    const targetKey = resource?.id ?? "";
    const lastKey = useRef<string>("");
    if (targetKey !== lastKey.current) {
        lastKey.current = targetKey;
        setFacilityId(resource?.facility_id ?? "");
        setUnitId(resource?.unit_id ?? "");
    }

    // Units are derived from the target facility's tier (cascading catalog).
    const { data: facilityUnits = [] } = useUnits(
        { facility_id: facilityId || undefined },
        { enabled: !!facilityId }
    );

    const handleAssign = () => {
        if (!resource) return;
        assign(
            {
                id: resource.id,
                payload: {
                    facility_id: facilityId || null,
                    unit_id: unitId || null,
                },
            },
            {
                onSuccess: () => {
                    toast({ variant: "success", title: facilityId ? "Resource assigned" : "Returned to stock" });
                    onClose();
                },
                onError: (e) =>
                    toast({ variant: "destructive", title: "Could not assign resource", description: getApiErrorMessage(e) }),
            }
        );
    };

    return (
        <Dialog open={!!resource} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{resource?.facility_id ? "Transfer" : "Assign"} Resource</DialogTitle>
                </DialogHeader>
                {resource && (
                    <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">{resource.resource_name}</p>
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
                        <div className="space-y-1.5">
                            <Label>Unit <span className="text-muted-foreground text-xs">(optional)</span></Label>
                            <Select value={unitId} onValueChange={setUnitId} disabled={!facilityId}>
                                <SelectTrigger>
                                    <SelectValue placeholder={facilityId ? "Select a unit" : "Select a facility first"} />
                                </SelectTrigger>
                                <SelectContent>
                                    {facilityUnits.map((u) => (
                                        <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex justify-between gap-2 pt-1">
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
                            <div className="flex gap-2">
                                <Button variant="outline" onClick={onClose}>Cancel</Button>
                                <Button onClick={handleAssign} disabled={isPending}>
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
