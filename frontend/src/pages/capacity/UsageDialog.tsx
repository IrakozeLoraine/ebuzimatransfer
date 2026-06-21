import { ResourceStatusBadge } from "@/components/atoms/ResourceStatusBadge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useResourceUsage } from "@/hooks/useResources";

export default function UsageDialog({ resourceId, onClose }: { resourceId: string | null; onClose: () => void }) {
    const { data, isLoading } = useResourceUsage(resourceId);

    return (
        <Dialog open={!!resourceId} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Resource Usage</DialogTitle>
                </DialogHeader>
                {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
                {data && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between rounded-md border p-3">
                            <div>
                                <p className="font-semibold">{data.resource.resource_name}</p>
                                <p className="text-xs text-muted-foreground">
                                    {data.resource.facility_name
                                        ? `${data.resource.facility_name}${data.resource.unit_name ? ` · ${data.resource.unit_name}` : ""}`
                                        : "Unassigned"}
                                </p>
                            </div>
                            <ResourceStatusBadge status={data.resource.status} />
                        </div>

                        <div>
                            <p className="mb-2 text-sm font-medium">Reservation history</p>
                            {data.reservations.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No reservations recorded.</p>
                            ) : (
                                <ul className="space-y-2 max-h-72 overflow-auto">
                                    {data.reservations.map((res) => (
                                        <li key={res.id} className="rounded-md border p-2.5 text-sm">
                                            <div className="flex items-center justify-between">
                                                <span className="font-medium">{res.reserved_by_name ?? "Unknown"}</span>
                                                <span className="text-xs text-muted-foreground">
                                                    {res.created_at ? new Date(res.created_at).toLocaleString() : "—"}
                                                </span>
                                            </div>
                                            {res.planned_admission_time && (
                                                <p className="text-xs text-muted-foreground mt-0.5">
                                                    Planned admission: {new Date(res.planned_admission_time).toLocaleString()}
                                                </p>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
};
