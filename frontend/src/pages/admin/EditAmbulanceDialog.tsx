import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toaster';
import { useResetAmbulancePassword, useUpdateAmbulance } from '@/hooks/useAmbulances';
import { Ambulance, AmbulanceCredentials } from '@/types/ambulance';
import { getApiErrorMessage } from '@/utils/apiError';
import { KeyRound } from 'lucide-react';
import { useState } from 'react';

export default function EditAmbulanceDialog({
    ambulance,
    onClose,
    onReset,
}: {
    ambulance: Ambulance | null;
    onClose: () => void;
    /** Hand fresh credentials to the parent so it can show the setup QR again. */
    onReset: (credentials: AmbulanceCredentials) => void;
}) {
    const { mutate: update, isPending } = useUpdateAmbulance();
    const { mutate: resetPassword, isPending: isResetting } = useResetAmbulancePassword();
    const [plate, setPlate] = useState("");
    const [driverName, setDriverName] = useState("");
    const [driverPhone, setDriverPhone] = useState("");

    // Sync the form when a different ambulance is opened.
    const [lastId, setLastId] = useState<string | null>(null);
    const currentId = ambulance?.id ?? null;
    if (currentId !== lastId) {
        setLastId(currentId);
        setPlate(ambulance?.plate_number ?? "");
        setDriverName(ambulance?.driver_name ?? "");
        setDriverPhone(ambulance?.driver_phone ?? "");
    }

    const submit = () => {
        if (!ambulance) return;
        update(
            {
                id: ambulance.id,
                payload: {
                    plate_number: plate.trim(),
                    driver_name: driverName,
                    driver_phone: driverPhone,
                },
            },
            {
                onSuccess: () => {
                    onClose();
                    toast({ variant: "success", title: "Ambulance updated" });
                },
                onError: (e) => toast({ variant: "destructive", title: "Could not update ambulance", description: getApiErrorMessage(e) }),
            }
        );
    };

    const reset = () => {
        if (!ambulance) return;
        resetPassword(ambulance.id, {
            onSuccess: (credentials) => {
                onClose();
                onReset(credentials);
            },
            onError: (e) => toast({ variant: "destructive", title: "Could not reset password", description: getApiErrorMessage(e) }),
        });
    };

    return (
        <Dialog open={!!ambulance} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Edit ambulance</DialogTitle>
                </DialogHeader>
                {ambulance && (
                    <div className="space-y-3">
                        <div className="space-y-1.5">
                            <Label>Plate number</Label>
                            <Input value={plate} onChange={(e) => setPlate(e.target.value)} />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5">
                                <Label>Driver name <span className="text-muted-foreground">(optional)</span></Label>
                                <Input value={driverName} onChange={(e) => setDriverName(e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Driver phone <span className="text-muted-foreground">(optional)</span></Label>
                                <Input value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} />
                            </div>
                        </div>
                        <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
                            <p className="text-xs text-muted-foreground">
                                Login ID: <span className="font-mono">{ambulance.login_id}</span>
                            </p>
                            <Button variant="outline" size="sm" onClick={reset} disabled={isResetting}>
                                <KeyRound className="mr-2 h-4 w-4" />
                                {isResetting ? "Resetting…" : "Reset password"}
                            </Button>
                            <p className="text-xs text-muted-foreground">
                                Generates a new password and shows a fresh setup QR. The old password
                                stops working once a new phone signs in with it.
                            </p>
                        </div>
                        <div className="flex justify-end gap-2 pt-1">
                            <Button variant="outline" onClick={onClose}>Cancel</Button>
                            <Button onClick={submit} disabled={isPending}>{isPending ? "Saving…" : "Save"}</Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
};
