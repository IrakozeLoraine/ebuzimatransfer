import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/toaster';
import { useFacilities } from '@/hooks/useFacilities';
import { usePermissions } from '@/hooks/usePermissions';
import { useCreateResource } from '@/hooks/useResources';
import { useUnits } from '@/hooks/useUnits';
import { ResourceFormValues, resourceSchema } from '@/schemas/resource.schema';
import { useAuthStore } from '@/store/auth.store';
import { Resource, RESOURCE_TYPES } from '@/types/resource';
import { getApiErrorMessage } from '@/utils/apiError';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

export default function AddResourceDialog({ open, onOpenChange }: { open?: boolean; onOpenChange?: (open: boolean) => void }) {
  const { isSuperAdmin } = usePermissions();
    const user = useAuthStore((s) => s.user);

    // A facility admin's resources live in their (active) facility; a super admin
    // picks a target facility in the create dialog. Units are derived from that
    // facility's tier (the cascading catalog) by the backend.
    const myFacilityId = user?.active_facility_id ?? user?.facilities?.[0]?.id ?? "";
    const [createFacilityId, setCreateFacilityId] = useState<string>("");
    const unitFacilityId = isSuperAdmin ? createFacilityId : myFacilityId;

    const { data: unitOptions = [] } = useUnits(
        { facility_id: unitFacilityId || undefined },
        { enabled: !!open && !!unitFacilityId }
    );
    const { data: facilities = [] } = useFacilities();
    const { mutate: createResource, isPending: creating } = useCreateResource();

    const form = useForm({ resolver: zodResolver(resourceSchema) });

    const onSubmit = (data: ResourceFormValues) => {
        createResource(
            {
                unit_id: data.unit_id || undefined,
                // Super admin targets a chosen facility (empty = central stock); a
                // facility admin's facility is resolved server-side.
                facility_id: isSuperAdmin ? (createFacilityId || undefined) : undefined,
                resource_name: data.resource_name,
                resource_code: data.resource_code,
                resource_type: data.resource_type as Resource["resource_type"] ?? undefined,
                quantity: data.quantity,
                notes: data.notes || undefined,
            },
            {
                onSuccess: () => {
                    toast({ variant: "success", title: "Resource added" });
                    onOpenChange?.(false);
                    setCreateFacilityId("");
                    form.reset();
                },
                onError: (e) => toast({ variant: "destructive", title: "Could not add resource", description: getApiErrorMessage(e) }),
            }
        );
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(o) => { onOpenChange?.(o); if (!o) { form.reset(); setCreateFacilityId(""); } }}
        >
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Add Resource</DialogTitle>
                </DialogHeader>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
                    {isSuperAdmin && (
                        <div className="space-y-1.5">
                            <Label>
                                Facility{" "}
                                <span className="text-muted-foreground text-xs">(optional — leave empty for central stock)</span>
                            </Label>
                            <Select
                                value={createFacilityId}
                                onValueChange={(v) => { setCreateFacilityId(v); form.setValue("unit_id", ""); }}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Unassigned (central stock)" />
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
                            {isSuperAdmin && (
                                <span className="text-muted-foreground text-xs">(select a facility first)</span>
                            )}
                        </Label>
                        <Select
                            key={unitFacilityId}
                            onValueChange={(v) => form.setValue("unit_id", v)}
                            disabled={isSuperAdmin && !createFacilityId}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder={isSuperAdmin && !createFacilityId ? "Select a facility first" : "Select a unit"} />
                            </SelectTrigger>
                            <SelectContent>
                                {unitOptions.map((u) => (
                                    <SelectItem key={u.id} value={u.id}>
                                        {u.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {form.formState.errors.unit_id && (
                            <p className="text-xs text-destructive">{form.formState.errors.unit_id.message}</p>
                        )}
                    </div>

                    <div className="space-y-1.5">
                        <Label>Resource Name</Label>
                        <Input placeholder="e.g. Maquet Servo-i Invasive Ventilator" {...form.register("resource_name")} />
                        {form.formState.errors.resource_name && (
                            <p className="text-xs text-destructive">{form.formState.errors.resource_name.message}</p>
                        )}
                    </div>

                    <div className="space-y-1.5">
                        <Label>Resource Code <span className="text-muted-foreground text-xs">(optional)</span></Label>
                        <Input placeholder="e.g. CHUK-ICU-MV-01" {...form.register("resource_code")} />
                    </div>

                    <div className="space-y-1.5">
                        <Label>Resource Type <span className="text-muted-foreground text-xs">(optional)</span></Label>
                        <Select onValueChange={(v) => form.setValue("resource_type", v)}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select a type" />
                            </SelectTrigger>
                            <SelectContent>
                                {RESOURCE_TYPES.map((t) => (
                                    <SelectItem key={t} value={t}>{t}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1.5">
                        <Label>Quantity</Label>
                        <Input type="number" min={1} defaultValue={1} {...form.register("quantity", { valueAsNumber: true })} />
                        {form.formState.errors.quantity && (
                            <p className="text-xs text-destructive">{form.formState.errors.quantity.message}</p>
                        )}
                    </div>

                    <div className="space-y-1.5">
                        <Label>Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
                        <Input placeholder="Additional details…" {...form.register("notes")} />
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <Button type="button" variant="outline" onClick={() => onOpenChange?.(false)}>Cancel</Button>
                        <Button type="submit" disabled={creating}>{creating ? "Adding…" : "Add Resource"}</Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}
