import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Sentinel value for the "All" option (Radix Select disallows empty string values). */
export const ALL_FILTER = "__all__";

export interface FilterOption {
  value: string;
  label: string;
}

export interface SelectFilter {
  key: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
  /** Label for the catch-all option, e.g. "All roles". */
  allLabel: string;
  className?: string;
}

interface Props {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  filters?: SelectFilter[];
  onReset: () => void;
}

export const TableToolbar = ({
  search,
  onSearchChange,
  searchPlaceholder = "Search…",
  filters = [],
  onReset,
}: Props) => {
  const hasActiveFilters =
    search.trim().length > 0 || filters.some((f) => f.value !== ALL_FILTER);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="pl-9"
        />
      </div>

      {filters.map((filter) => (
        <Select key={filter.key} value={filter.value} onValueChange={filter.onChange}>
          <SelectTrigger className={filter.className ?? "sm:w-52"}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_FILTER}>{filter.allLabel}</SelectItem>
            {filter.options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}

      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onReset}
          className="text-muted-foreground shrink-0"
        >
          <X className="mr-1 h-4 w-4" />
          Clear
        </Button>
      )}
    </div>
  );
};
