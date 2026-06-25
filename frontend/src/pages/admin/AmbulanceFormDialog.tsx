import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/toaster';
import { useCreateAmbulance } from '@/hooks/useAmbulances';
import type { AmbulanceCredentials } from '@/types/ambulance';
import { getApiErrorMessage } from '@/utils/apiError';
import { useState } from 'react'

export default function AmbulanceFormDialog({
    open,
    onOpenChange,
    requireFacility,
    facilities,
    onRegistered,
}: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    requireFacility: boolean;
    facilities: { id: string; name: string }[];
    /** Hand the one-time credentials to the parent so it can show the setup QR. */
    onRegistered: (credentials: AmbulanceCredentials) => void;
}) {
    const { mutate: createAmbulance, isPending } = useCreateAmbulance();
    const [plate, setPlate] = useState("");
    const [driverName, setDriverName] = useState("");
    const [driverPhone, setDriverPhone] = useState("");
    const [loginId, setLoginId] = useState("");
    const [facilityId, setFacilityId] = useState("");

    const reset = () => {
        setPlate(""); setDriverName(""); setDriverPhone(""); setLoginId(""); setFacilityId("");
    };

    const submit = () => {
        if (!plate.trim() || !loginId.trim()) {
            toast({ variant: "destructive", title: "Plate and driver login ID are required" });
            return;
        }
        if (requireFacility && !facilityId) {
            toast({ variant: "destructive", title: "Select the facility this ambulance belongs to" });
            return;
        }
        createAmbulance(
            {
                plate_number: plate.trim(),
                driver_name: driverName || undefined,
                driver_phone: driverPhone || undefined,
                login_id: loginId.trim(),
                facility_id: requireFacility ? facilityId : undefined,
            },
            {
                onSuccess: (credentials) => {
                    reset();
                    onOpenChange(false);
                    onRegistered(credentials);
                },
                onError: (e) => toast({ variant: "destructive", title: "Could not register ambulance", description: getApiErrorMessage(e) }),
            }
        );
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Register ambulance</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                    <div className="space-y-1.5">
                        <Label>Plate number</Label>
                        <Input value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="e.g. RAD 432 H" />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label>Driver name</Label>
                            <Input value={driverName} onChange={(e) => setDriverName(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Driver phone</Label>
                            <Input value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} />
                        </div>
                    </div>
                    {requireFacility && (
                        <div className="space-y-1.5">
                            <Label>Facility</Label>
                            <Select value={facilityId} onValueChange={setFacilityId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select the owning facility" />
                                </SelectTrigger>
                                <SelectContent>
                                    {facilities.map((f) => (
                                        <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    <div className="rounded-lg border bg-muted/40 p-3 space-y-3">
                        <div className="space-y-1.5">
                            <Label>Driver login ID</Label>
                            <Input value={loginId} onChange={(e) => setLoginId(e.target.value)} placeholder="e.g. amb-432h" autoCapitalize="none" />
                        </div>
                        <p className="text-xs text-muted-foreground">
                            A password is generated automatically. After you register, you'll get a
                            QR code to set up the driver's phone in one scan.
                        </p>
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                        <Button onClick={submit} disabled={isPending}>{isPending ? "Registering…" : "Register"}</Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
