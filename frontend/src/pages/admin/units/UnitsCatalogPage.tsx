import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Upload } from "lucide-react";
import { DataTable } from "@/components/organisms/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/responsive-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/molecules/ConfirmDialog";
import { TableToolbar, ALL_FILTER } from "@/components/molecules/TableToolbar";
import { toast } from "@/components/ui/toaster";
import { getApiErrorMessage } from "@/utils/apiError";
import { useUnits, useCreateUnit, useUpdateUnit, useDeleteUnit } from "@/hooks/useUnits";
import type { Unit, FacilityTier } from "@/types/unit";
import { FACILITY_TYPES, TYPE_BADGES, facilityTypeLabel } from "../facilities/constants";
import UnitImportDialog from "./UnitImportDialog";

export const UnitsCatalogPage = () => {
  // Include inactive units so the catalog can be fully managed.
  const { data: units = [], isLoading } = useUnits({ active: false });
  const { mutate: deleteUnit } = useDeleteUnit();

  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editing, setEditing] = useState<Unit | null>(null);
  const [toDelete, setToDelete] = useState<Unit | null>(null);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState(ALL_FILTER);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return units.filter((u) => {
      const matchesSearch =
        !q || u.name.toLowerCase().includes(q) || (u.code?.toLowerCase().includes(q) ?? false);
      const matchesTier = tierFilter === ALL_FILTER || u.tier === tierFilter;
      return matchesSearch && matchesTier;
    });
  }, [units, search, tierFilter]);

  const openCreate = () => {
    setEditing(null);
    setShowForm(true);
  };

  const openEdit = (u: Unit) => {
    setEditing(u);
    setShowForm(true);
  };

  const columns = [
    { header: "Unit", accessor: (u: Unit) => <span className="font-medium">{u.name}</span> },
    {
      header: "Code",
      accessor: (u: Unit) => <span className="font-mono text-xs text-muted-foreground">{u.code ?? "—"}</span>,
    },
    {
      header: "Tier",
      accessor: (u: Unit) => (
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            TYPE_BADGES[u.tier] ?? "bg-muted text-muted-foreground"
          }`}
        >
          {facilityTypeLabel(u.tier)}
        </span>
      ),
    },
    {
      header: "Status",
      accessor: (u: Unit) => (
        <span className={`text-xs font-medium ${u.is_active ? "text-emerald-600" : "text-muted-foreground"}`}>
          {u.is_active ? "Active" : "Inactive"}
        </span>
      ),
    },
    {
      header: "",
      accessor: (u: Unit) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-foreground" onClick={() => openEdit(u)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={() => setToDelete(u)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Clinical Units Catalog</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Units cascade upward: a facility automatically has every unit at or below its tier.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowImport(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Import
          </Button>
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            New Unit
          </Button>
        </div>
      </div>

      <TableToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name or code…"
        onReset={() => { setSearch(""); setTierFilter(ALL_FILTER); }}
        filters={[
          {
            key: "tier",
            value: tierFilter,
            onChange: setTierFilter,
            allLabel: "All tiers",
            options: FACILITY_TYPES.map((t) => ({ value: t.value, label: t.label })),
          },
        ]}
      />

      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        keyExtractor={(u) => u.id}
        emptyMessage="No units match your filters"
        pageSize={10}
        exportable={{
          filename: "clinical-units",
          columns: [
            { header: "Unit", value: (u) => u.name },
            { header: "Code", value: (u) => u.code ?? "" },
            { header: "Tier", value: (u) => facilityTypeLabel(u.tier) },
            { header: "Status", value: (u) => (u.is_active ? "Active" : "Inactive") },
          ],
        }}
      />

      <UnitFormDialog open={showForm} unit={editing} onOpenChange={setShowForm} />

      <UnitImportDialog open={showImport} onOpenChange={setShowImport} />

      <ConfirmDialog
        open={!!toDelete}
        title="Delete unit"
        description={`Delete "${toDelete?.name}" from the catalog? If it has resources assigned, deactivate it instead.`}
        confirmLabel="Delete"
        destructive
        onConfirm={() =>
          toDelete &&
          deleteUnit(toDelete.id, {
            onSuccess: () => { toast({ variant: "success", title: "Unit deleted" }); setToDelete(null); },
            onError: (e) => toast({ variant: "destructive", title: "Could not delete unit", description: getApiErrorMessage(e) }),
          })
        }
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
};

/* ---------------- Create / Edit dialog ---------------- */

const UnitFormDialog = ({
  open,
  unit,
  onOpenChange,
}: {
  open: boolean;
  unit: Unit | null;
  onOpenChange: (o: boolean) => void;
}) => {
  const { mutate: createUnit, isPending: creating } = useCreateUnit();
  const { mutate: updateUnit, isPending: updating } = useUpdateUnit();

  const [name, setName] = useState("");
  const [tier, setTier] = useState<FacilityTier | "">("");
  const [code, setCode] = useState("");
  const [isActive, setIsActive] = useState(true);

  // Seed the form whenever a different unit (or create) is opened.
  const key = `${open}:${unit?.id ?? "new"}`;
  const [lastKey, setLastKey] = useState("");
  if (key !== lastKey) {
    setLastKey(key);
    setName(unit?.name ?? "");
    setTier(unit?.tier ?? "");
    setCode(unit?.code ?? "");
    setIsActive(unit?.is_active ?? true);
  }

  const close = () => onOpenChange(false);

  const submit = () => {
    if (!name.trim() || !tier) {
      toast({ variant: "destructive", title: "Name and tier are required" });
      return;
    }
    if (unit) {
      updateUnit(
        { id: unit.id, payload: { name: name.trim(), tier, code: code.trim() || undefined, is_active: isActive } },
        {
          onSuccess: () => { toast({ variant: "success", title: "Unit updated" }); close(); },
          onError: (e) => toast({ variant: "destructive", title: "Could not update unit", description: getApiErrorMessage(e) }),
        }
      );
    } else {
      createUnit(
        { name: name.trim(), tier, code: code.trim() || undefined },
        {
          onSuccess: () => { toast({ variant: "success", title: "Unit created" }); close(); },
          onError: (e) => toast({ variant: "destructive", title: "Could not create unit", description: getApiErrorMessage(e) }),
        }
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{unit ? "Edit Unit" : "New Clinical Unit"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Neurosurgery Unit" />
          </div>
          <div className="space-y-1.5">
            <Label>Tier</Label>
            <Select value={tier} onValueChange={(v) => setTier(v as FacilityTier)}>
              <SelectTrigger>
                <SelectValue placeholder="Select a tier" />
              </SelectTrigger>
              <SelectContent>
                {FACILITY_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              The lowest facility tier that offers this unit; higher tiers inherit it.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Code <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. NEUROSURGERY" />
          </div>
          {unit && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              Active (available to facilities)
            </label>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={close}>Cancel</Button>
            <Button onClick={submit} disabled={creating || updating}>
              {creating || updating ? "Saving…" : unit ? "Save" : "Create"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
