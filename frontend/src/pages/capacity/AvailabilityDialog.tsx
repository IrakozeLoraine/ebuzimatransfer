import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { Minus, Plus } from "lucide-react";
import { useUpdateResourceCounts } from "@/hooks/useResources";
import { Resource } from "@/types/resource";
import { getApiErrorMessage } from "@/utils/apiError";
import { cn } from "@/utils/cn";

/** Buckets the user can edit directly; AVAILABLE is the remainder. */
const BUCKETS = [
  { key: "occupied", label: "Occupied", dot: "bg-rose-500" },
  { key: "reserved", label: "Reserved", dot: "bg-amber-500" },
  { key: "out_of_service", label: "Out of service", dot: "bg-gray-400" },
] as const;

type BucketKey = (typeof BUCKETS)[number]["key"];

interface Props {
  resource: Resource | null;
  onClose: () => void;
}

export default function AvailabilityDialog({ resource, onClose }: Props) {
  const { mutate, isPending } = useUpdateResourceCounts();
  const [counts, setCounts] = useState<Record<BucketKey, number>>({
    occupied: 0,
    reserved: 0,
    out_of_service: 0,
  });

  // Seed the steppers from the resource each time the dialog opens (i.e. whenever
  // the resource reference changes) — adjusting state during render rather than in
  // an effect avoids a cascading re-render.
  const [seededFor, setSeededFor] = useState<Resource | null>(null);
  if (resource !== seededFor) {
    setSeededFor(resource);
    if (resource) {
      setCounts({
        occupied: resource.occupied,
        reserved: resource.reserved,
        out_of_service: resource.out_of_service,
      });
    }
  }

  const quantity = resource?.quantity ?? 0;
  const used = counts.occupied + counts.reserved + counts.out_of_service;
  const available = quantity - used;

  const adjust = (key: BucketKey, delta: number) =>
    setCounts((prev) => {
      const next = Math.max(0, prev[key] + delta);
      // Don't let the buckets exceed the group's quantity.
      const others = used - prev[key];
      if (next + others > quantity) return prev;
      return { ...prev, [key]: next };
    });

  const save = () => {
    if (!resource) return;
    mutate(
      { id: resource.id, counts },
      {
        onSuccess: () => {
          toast({ variant: "success", title: "Availability updated" });
          onClose();
        },
        onError: (e) =>
          toast({ variant: "destructive", title: "Could not update", description: getApiErrorMessage(e) }),
      }
    );
  };

  return (
    <Dialog open={!!resource} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Update Availability</DialogTitle>
          <DialogDescription>
            {resource?.resource_name} — {quantity} unit{quantity === 1 ? "" : "s"} total
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {BUCKETS.map(({ key, label, dot }) => (
            <div key={key} className="flex items-center justify-between rounded-md border p-2.5">
              <span className="flex items-center gap-2 text-sm font-medium">
                <span className={cn("h-2 w-2 rounded-full", dot)} />
                {label}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => adjust(key, -1)}
                  disabled={counts[key] <= 0}
                >
                  <Minus className="h-3.5 w-3.5" />
                </Button>
                <span className="w-8 text-center tabular-nums font-semibold">{counts[key]}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => adjust(key, 1)}
                  disabled={available <= 0}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}

          <div className="flex items-center justify-between rounded-md bg-emerald-50 px-3 py-2.5 ring-1 ring-emerald-200">
            <span className="flex items-center gap-2 text-sm font-medium text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Available
            </span>
            <span className="tabular-nums text-lg font-bold text-emerald-700">{available}</span>
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={isPending}>
            {isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
