import { Eye, Pencil, Trash2, UserCheck, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Column } from "@/components/organisms/DataTable";
import type { User } from "@/types/user";
import { formatDate } from "@/utils/format";
import { ACCOUNT_STATUS_LABELS } from "./constants";

interface ColumnActions {
  isSuperAdmin: boolean;
  onView: (user: User) => void;
  onEdit: (user: User) => void;
  onDeactivate: (user: User) => void;
}

export const getUserColumns = ({
  isSuperAdmin,
  onView,
  onEdit,
  onDeactivate,
}: ColumnActions): Column<User>[] => [
  {
    header: "Name",
    accessor: (u: User) => (
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-r-0 border-primary text-xs font-semibold text-primary">
          {u.first_name[0]}{u.last_name[0]}
        </div>
        <div>
          <p className="font-semibold">{u.first_name} {u.last_name}</p>
          <p className="text-xs text-muted-foreground">{u.medical_id}</p>
        </div>
      </div>
    ),
  },
  { header: "Email", accessor: (u: User) => <span className="text-muted-foreground text-sm">{u.email}</span> },
  {
    header: "Facilities",
    accessor: (u: User) => {
      const names = u.facilities.map((f) => f.name);
      const hasGlobal = u.global_roles.length > 0;
      if (names.length === 0 && !hasGlobal) {
        return <span className="text-xs text-muted-foreground">—</span>;
      }
      return (
        <div className="flex flex-wrap items-center gap-1.5 max-w-xs">
          {hasGlobal && (
            <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-teal-50 text-teal-700 ring-1 ring-teal-200">
              Global
            </span>
          )}
          {names.length > 0 ? (
            <span className="text-xs text-muted-foreground">{names.join(", ")}</span>
          ) : null}
        </div>
      );
    },
  },
  {
    header: "Status",
    accessor: (u: User) => {
      const label = ACCOUNT_STATUS_LABELS[u.account_status] ?? u.account_status;
      const colorClass =
        u.account_status === "ACTIVE"
          ? "text-emerald-600"
          : u.account_status === "PASSWORD_RESET_ENABLED"
          ? "text-amber-600"
          : "text-muted-foreground";
      return (
        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${colorClass}`}>
          {u.is_active ? <UserCheck className="h-3.5 w-3.5" /> : <UserX className="h-3.5 w-3.5" />}
          {label}
        </span>
      );
    },
  },
  {
    header: "Created",
    accessor: (u: User) => <span className="text-xs text-muted-foreground">{formatDate(u.created_at)}</span>,
  },
  {
    header: "",
    accessor: (u: User) => (
      <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground hover:text-foreground"
          onClick={() => onView(u)}
        >
          <Eye className="h-4 w-4" />
        </Button>
        {isSuperAdmin && (
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => onEdit(u)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
        )}
        {isSuperAdmin && u.is_active && (
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={() => onDeactivate(u)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    ),
  },
];
