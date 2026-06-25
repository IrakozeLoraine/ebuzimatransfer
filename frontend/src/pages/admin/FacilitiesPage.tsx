import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFacilities, useDeleteFacility, useReactivateFacility } from "@/hooks/useFacilities";
import { DataTable } from "@/components/organisms/DataTable";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/molecules/ConfirmDialog";
import { TableToolbar, ALL_FILTER } from "@/components/molecules/TableToolbar";
import { Plus, Trash2, Pencil, Eye, Upload, RotateCcw } from "lucide-react";
import type { Facility } from "@/types/facility";
import { FacilityFormDialog } from "./facilities/FacilityFormDialog";
import FacilityImportDialog from "./facilities/FacilityImportDialog";
import { FACILITY_TYPES, TYPE_BADGES, facilityTypeLabel } from "./facilities/constants";

export const FacilitiesPage = () => {
  const navigate = useNavigate();
  const { data: facilities = [], isLoading } = useFacilities();
  const { mutate: deleteFac } = useDeleteFacility();
  const { mutate: reactivateFac } = useReactivateFacility();
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editing, setEditing] = useState<Facility | null>(null);
  const [toDelete, setToDelete] = useState<Facility | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState(ALL_FILTER);
  const [statusFilter, setStatusFilter] = useState(ALL_FILTER);

  const filteredFacilities = useMemo(() => {
    const q = search.trim().toLowerCase();
    return facilities.filter((f) => {
      const matchesSearch =
        !q ||
        f.name.toLowerCase().includes(q) ||
        (f.location?.toLowerCase().includes(q) ?? false) ||
        (f.district?.toLowerCase().includes(q) ?? false) ||
        (f.province?.toLowerCase().includes(q) ?? false);
      const matchesType = typeFilter === ALL_FILTER || f.type === typeFilter;
      const matchesStatus =
        statusFilter === ALL_FILTER ||
        (statusFilter === "active" ? f.is_active : !f.is_active);
      return matchesSearch && matchesType && matchesStatus;
    });
  }, [facilities, search, typeFilter, statusFilter]);

  const resetFilters = () => {
    setSearch("");
    setTypeFilter(ALL_FILTER);
    setStatusFilter(ALL_FILTER);
  };

  const openCreate = () => {
    setEditing(null);
    setShowForm(true);
  };

  const openEdit = (f: Facility) => {
    setEditing(f);
    setShowForm(true);
  };

  const columns = [
    {
      header: "Name",
      accessor: (f: Facility) => <span className="font-medium">{f.name}</span>,
    },
    {
      header: "Type",
      accessor: (f: Facility) => (
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium truncate ${
            TYPE_BADGES[f.type] ?? "bg-muted text-muted-foreground"
          }`}
        >
          {facilityTypeLabel(f.type)}
        </span>
      ),
    },
    {
      header: "Province",
      accessor: (f: Facility) => <span className="text-sm text-muted-foreground">{f.province ?? "—"}</span>,
    },
    {
      header: "District",
      accessor: (f: Facility) => <span className="text-sm text-muted-foreground">{f.district ?? "—"}</span>,
    },
    {
      header: "Status",
      accessor: (f: Facility) => (
        <span className={`text-xs font-medium ${f.is_active ? "text-emerald-600" : "text-muted-foreground"}`}>
          {f.is_active ? "Active" : "Inactive"}
        </span>
      ),
    },
    {
      header: "",
      accessor: (f: Facility) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => navigate(`/admin/facilities/${f.id}`)}
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => openEdit(f)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          {f.is_active ? (
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              title="Deactivate facility"
              onClick={() => setToDelete(f)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50"
              title="Reactivate facility"
              onClick={() => reactivateFac(f.id)}
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Facility Management</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {facilities.filter((f) => f.is_active).length} active facilities
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowImport(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Import
          </Button>
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            New Facility
          </Button>
        </div>
      </div>

      <TableToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name, location, district, or province…"
        onReset={resetFilters}
        filters={[
          {
            key: "type",
            value: typeFilter,
            onChange: setTypeFilter,
            allLabel: "All types",
            options: FACILITY_TYPES.map((t) => ({ value: t.value, label: t.label })),
          },
          {
            key: "status",
            value: statusFilter,
            onChange: setStatusFilter,
            allLabel: "All statuses",
            className: "sm:w-40",
            options: [
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ],
          },
        ]}
      />

      <DataTable
        columns={columns}
        data={filteredFacilities}
        isLoading={isLoading}
        keyExtractor={(f) => f.id}
        onRowClick={(f) => navigate(`/admin/facilities/${f.id}`)}
        emptyMessage="No facilities match your filters"
        pageSize={10}
        exportable={{
          filename: "facilities",
          columns: [
            { header: "Name", value: (f) => f.name },
            { header: "Type", value: (f) => facilityTypeLabel(f.type) },
            { header: "Province", value: (f) => f.province ?? "" },
            { header: "District", value: (f) => f.district ?? "" },
            { header: "Status", value: (f) => (f.is_active ? "Active" : "Inactive") },
          ],
        }}
      />

      <FacilityFormDialog open={showForm} facility={editing} onOpenChange={setShowForm} />

      <FacilityImportDialog open={showImport} onOpenChange={setShowImport} />

      <ConfirmDialog
        open={!!toDelete}
        title="Deactivate Facility"
        description={`Deactivate ${toDelete?.name}? It will be hidden from capacity views.`}
        confirmLabel="Deactivate"
        destructive
        onConfirm={() => toDelete && deleteFac(toDelete.id, { onSuccess: () => setToDelete(null) })}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
};
