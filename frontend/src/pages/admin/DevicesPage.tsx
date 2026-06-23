import { useState } from "react";
import { Plus, Copy, Check, Radio } from "lucide-react";
import { DataTable } from "@/components/organisms/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/responsive-dialog";
import { toast } from "@/components/ui/toaster";
import { getApiErrorMessage } from "@/utils/apiError";
import { useDevices, useCreateDevice, useSetDeviceActive } from "@/hooks/useDevices";
import type { AmbulanceDevice, AmbulanceDeviceCreated } from "@/types/ambulance";
import { formatDateTime } from "@/utils/format";

export const DevicesPage = () => {
  const { data: devices = [], isLoading } = useDevices();
  const { mutate: setActive } = useSetDeviceActive();

  const [showForm, setShowForm] = useState(false);
  // Holds a just-created device so its one-time API key can be shown.
  const [created, setCreated] = useState<AmbulanceDeviceCreated | null>(null);

  const columns = [
    { header: "Tracker", accessor: (d: AmbulanceDevice) => <span className="font-medium">{d.label}</span> },
    {
      header: "Registered",
      accessor: (d: AmbulanceDevice) => (
        <span className="text-xs text-muted-foreground">{formatDateTime(d.created_at)}</span>
      ),
    },
    {
      header: "Status",
      accessor: (d: AmbulanceDevice) => (
        <span className={`text-xs font-medium ${d.is_active ? "text-emerald-600" : "text-muted-foreground"}`}>
          {d.is_active ? "Active" : "Disabled"}
        </span>
      ),
    },
    {
      header: "",
      accessor: (d: AmbulanceDevice) => (
        <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground hover:text-foreground"
            onClick={() =>
              setActive(
                { id: d.id, isActive: !d.is_active },
                {
                  onSuccess: () => toast({ variant: "success", title: d.is_active ? "Tracker disabled" : "Tracker enabled" }),
                  onError: (e) => toast({ variant: "destructive", title: "Could not update tracker", description: getApiErrorMessage(e) }),
                }
              )
            }
          >
            {d.is_active ? "Disable" : "Enable"}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Radio className="h-6 w-6 text-primary" /> Ambulance GPS Trackers
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Hardware trackers mounted in ambulances. Assign one when arranging transport to track the journey live.
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Register tracker
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={devices}
        isLoading={isLoading}
        keyExtractor={(d) => d.id}
        emptyMessage="No trackers registered yet"
        pageSize={10}
      />

      <DeviceFormDialog open={showForm} onOpenChange={setShowForm} onCreated={setCreated} />
      <DeviceKeyDialog device={created} onClose={() => setCreated(null)} />
    </div>
  );
};

/* ---------------- Register dialog ---------------- */

const DeviceFormDialog = ({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (d: AmbulanceDeviceCreated) => void;
}) => {
  const { mutate: createDevice, isPending } = useCreateDevice();
  const [label, setLabel] = useState("");

  const submit = () => {
    if (!label.trim()) {
      toast({ variant: "destructive", title: "A label is required" });
      return;
    }
    createDevice(
      { label: label.trim() },
      {
        onSuccess: (d) => {
          setLabel("");
          onOpenChange(false);
          onCreated(d);
        },
        onError: (e) => toast({ variant: "destructive", title: "Could not register tracker", description: getApiErrorMessage(e) }),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Register GPS tracker</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Label</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. RAD 432 H — front cabin" />
            <p className="text-xs text-muted-foreground">
              A name to recognise the device (e.g. the ambulance plate it is fitted to).
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

/* ---------------- One-time API key dialog ---------------- */

const DeviceKeyDialog = ({
  device,
  onClose,
}: {
  device: AmbulanceDeviceCreated | null;
  onClose: () => void;
}) => {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!device) return;
    await navigator.clipboard.writeText(device.api_key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={!!device} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tracker registered</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Configure this key on <span className="font-medium text-foreground">{device?.label}</span>. The device sends it
            as the <code className="rounded bg-muted px-1 py-0.5 text-xs">X-Device-Key</code> header when reporting its position.
          </p>
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            This key is shown only once. Copy it now — it cannot be retrieved later.
          </div>
          <div className="flex items-center gap-2">
            <Input readOnly value={device?.api_key ?? ""} className="font-mono text-xs" />
            <Button variant="outline" size="icon" onClick={copy}>
              {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <div className="flex justify-end pt-1">
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
