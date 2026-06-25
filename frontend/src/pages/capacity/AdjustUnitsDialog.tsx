import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/responsive-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toaster";
import { useAddResourceUnits, useRemoveResourceUnits } from "@/hooks/useResources";
import { cn } from "@/utils/cn";
import { Resource } from "@/types/resource";
import { getApiErrorMessage } from "@/utils/apiError";
import { useState } from "react";

type Mode = "add" | "remove";

export default function AdjustUnitsDialog({
    resource,
    onClose,
}: {
    resource: Resource | null;
    onClose: () => void;
}) {
    const { mutate: addUnits, isPending: isAdding } = useAddResourceUnits();
    const { mutate: removeUnits, isPending: isRemoving } = useRemoveResourceUnits();
    const open = resource != null;
    const isPending = isAdding || isRemoving;

    const [mode, setMode] = useState<Mode>("add");
    const [count, setCount] = useState<string>("1");

    // Reset the form whenever a different resource is targeted. Normalising the id
    // to a string keeps this comparison stable (so it can't loop while closed).
    const resourceKey = resource?.id ?? "";
    const [lastKey, setLastKey] = useState<string>("");
    if (resourceKey !== lastKey) {
        setLastKey(resourceKey);
        setMode("add");
        setCount("1");
    }

    // Added units land in central stock (out of service) or become available at a facility.
    const inStock = resource != null && resource.facility_id == null && resource.unit_id == null;
    const removable = resource?.out_of_service ?? 0;

    const parsed = parseInt(count, 10);
    const value = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    const overRemovable = mode === "remove" && value !== null && value > removable;

    const handleSubmit = () => {
        if (!resource || value === null || overRemovable) return;
        const onSuccess = () => {
            toast({
                variant: "success",
                title: `${value} unit${value === 1 ? "" : "s"} ${mode === "add" ? "added" : "removed"}`,
            });
            onClose();
        };
        const onError = (e: unknown) =>
            toast({
                variant: "destructive",
                title: `Could not ${mode} units`,
                description: getApiErrorMessage(e),
            });
        if (mode === "add") addUnits({ id: resource.id, count: value }, { onSuccess, onError });
        else removeUnits({ id: resource.id, count: value }, { onSuccess, onError });
    };

    const tab = (m: Mode, label: string, disabled?: boolean) => (
        <button
            type="button"
            disabled={disabled}
            onClick={() => {
                setMode(m);
                setCount("1");
            }}
            className={cn(
                "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-40",
                mode === m ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
        >
            {label}
        </button>
    );

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Adjust units</DialogTitle>
                </DialogHeader>
                {resource && (
                    <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                            {resource.resource_name} — currently {resource.quantity} unit
                            {resource.quantity === 1 ? "" : "s"}
                            {resource.facility_name ? ` at ${resource.facility_name}` : " in central stock"}
                        </p>

                        <div className="flex gap-1 rounded-lg bg-muted p-1">
                            {tab("add", "Add")}
                            {tab("remove", `Remove${removable > 0 ? ` (${removable})` : ""}`, removable < 1)}
                        </div>

                        <div className="space-y-1.5">
                            <Label>Units to {mode}</Label>
                            <Input
                                type="number"
                                min={1}
                                max={mode === "remove" ? removable : undefined}
                                value={count}
                                onChange={(e) => setCount(e.target.value)}
                            />
                            <p className={cn("text-xs", overRemovable ? "text-destructive" : "text-muted-foreground")}>
                                {mode === "add"
                                    ? inStock
                                        ? "Added to central stock, held out of service until assigned."
                                        : "Added as available units at this assignment."
                                    : overRemovable
                                    ? `Only ${removable} out-of-service unit${removable === 1 ? "" : "s"} can be removed.`
                                    : "Only out-of-service units can be removed."}
                            </p>
                        </div>

                        <div className="flex justify-end gap-2 pt-1">
                            <Button variant="outline" onClick={onClose}>Cancel</Button>
                            <Button
                                onClick={handleSubmit}
                                disabled={isPending || value === null || overRemovable}
                            >
                                {isPending ? "Saving…" : mode === "add" ? "Add" : "Remove"}
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
