import { useState } from "react";
import { Phone, Trash2, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePhoneLines, useCreatePhoneLine, useDeletePhoneLine } from "@/hooks/useCalls";
import { toast } from "@/components/ui/toaster";
import { getApiErrorMessage } from "@/utils/apiError";
import type { PhoneLineType } from "@/types/call";

const TYPES: { value: PhoneLineType; label: string }[] = [
  { value: "EMERGENCY", label: "Emergency" },
  { value: "COORDINATION", label: "Coordination" },
  { value: "SUPERVISOR", label: "Supervisor" },
  { value: "TOLLFREE", label: "Toll-free" },
  { value: "DISPATCH", label: "Dispatch" },
  { value: "OTHER", label: "Other" },
];

export const FacilityPhoneLinesTab = ({ facilityId }: { facilityId: string }) => {
  const { data: lines = [], isLoading } = usePhoneLines(facilityId, false);
  const { mutate: create, isPending: creating } = useCreatePhoneLine(facilityId);
  const { mutate: remove } = useDeletePhoneLine(facilityId);

  const [label, setLabel] = useState("");
  const [phone, setPhone] = useState("");
  const [type, setType] = useState<PhoneLineType>("COORDINATION");

  const add = () => {
    if (!label.trim() || !phone.trim()) return;
    create(
      { label: label.trim(), phone_number: phone.trim(), line_type: type },
      {
        onSuccess: () => {
          toast({ variant: "success", title: "Phone line added" });
          setLabel("");
          setPhone("");
        },
        onError: (e) => toast({ variant: "destructive", title: "Could not add line", description: getApiErrorMessage(e) }),
      }
    );
  };

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <p className="mb-4 text-sm text-muted-foreground">
          Institutional / department lines clinicians can call from the web to coordinate transfers. Every call is logged.
        </p>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_180px_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label>Label</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="ER Main Reception" />
          </div>
          <div className="space-y-1.5">
            <Label>Phone number</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0788xxxxxx / 912" />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as PhoneLineType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={add} disabled={creating || !label.trim() || !phone.trim()}>
            <Plus className="mr-1.5 h-4 w-4" /> Add
          </Button>
        </div>
      </Card>

      <Card className="p-5">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">No phone lines yet.</p>
        ) : (
          <ul className="divide-y">
            {lines.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{l.label}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {l.phone_number} · {TYPES.find((t) => t.value === l.line_type)?.label ?? l.line_type}
                      {!l.is_active && " · inactive"}
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  onClick={() => remove(l.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
};
