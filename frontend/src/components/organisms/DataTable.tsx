import { useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pagination } from "@/components/molecules/Pagination";
import { Checkbox } from "@/components/ui/checkbox";
import { ExportButtons } from "@/components/molecules/ExportButtons";
import { cn } from "@/utils/cn";
import { FileSearch } from "lucide-react";
import type { ExportColumn } from "@/utils/export";

export interface Column<T> {
  header: string;
  accessor: keyof T | ((row: T) => React.ReactNode);
  className?: string;
}

/** Optional multi-row selection: renders a leading checkbox column. */
export interface TableSelection {
  selectedIds: Set<string>;
  /** Toggle a single row by its key. */
  onToggle: (id: string) => void;
  /** Toggle all currently-shown rows (passed their keys). */
  onToggleAll: (ids: string[]) => void;
}

interface Props<T> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
  isLoading?: boolean;
  emptyMessage?: string;
  keyExtractor: (row: T) => string;
  /** Initial rows per page. Omit to disable pagination. */
  pageSize?: number;
  /** Page-size options shown in the rows-per-page selector. */
  pageSizeOptions?: number[];
  /** Enables a leading checkbox column for selecting rows. */
  selection?: TableSelection;
  /** Adds a CSV/Excel export toolbar above the table (exports the full data). */
  exportable?: {
    /** Base file name, without extension. */
    filename: string;
    columns: ExportColumn<T>[];
  };
}

const SkeletonRow = ({ cols }: { cols: number }) => (
  <TableRow className="hover:bg-transparent even:bg-transparent">
    {Array.from({ length: cols }).map((_, i) => (
      <TableCell key={i}>
        <div className={cn("h-4 rounded-md shimmer", i === 0 ? "w-24" : "w-32")} />
      </TableCell>
    ))}
  </TableRow>
);

const renderCell = <T,>(col: Column<T>, row: T): React.ReactNode =>
  typeof col.accessor === "function"
    ? col.accessor(row)
    : String(row[col.accessor] ?? "");

// Stacked card shown instead of a table row on phones — avoids horizontal scrolling.
const MobileCard = <T,>({
  row,
  columns,
  onClick,
  selected,
  onToggleSelect,
}: {
  row: T;
  columns: Column<T>[];
  onClick?: (row: T) => void;
  selected?: boolean;
  onToggleSelect?: () => void;
}) => (
  <div
    onClick={() => onClick?.(row)}
    className={cn("space-y-2 p-4", onClick && "cursor-pointer active:bg-primary/[0.04]")}
  >
    {onToggleSelect && (
      <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
        <Checkbox checked={selected} onCheckedChange={onToggleSelect} aria-label="Select row" />
      </div>
    )}
    {columns.map((col) => (
      <div key={String(col.header)} className="flex flex-col md:flex-row items-start justify-between gap-2 gap-3">
        {col.header && (
          <span className="shrink-0 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {col.header}
          </span>
        )}
        <span className="min-w-0 text-right text-sm">{renderCell(col, row)}</span>
      </div>
    ))}
  </div>
);

const MobileSkeletonCard = ({ rows }: { rows: number }) => (
  <div className="space-y-2 p-4">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="flex items-center justify-between gap-3">
        <div className="h-3 w-16 rounded-md shimmer" />
        <div className="h-4 w-28 rounded-md shimmer" />
      </div>
    ))}
  </div>
);

export const DataTable = <T,>({
  columns,
  data,
  onRowClick,
  isLoading,
  emptyMessage = "No data found",
  keyExtractor,
  pageSize,
  pageSizeOptions,
  selection,
  exportable,
}: Props<T>) => {
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(pageSize ?? 0);

  const totalPages = size ? Math.max(1, Math.ceil(data.length / size)) : 1;
  // Clamp the page to valid bounds without an effect (e.g. when filters shrink the data).
  const currentPage = Math.min(page, totalPages);

  const pageData = useMemo(() => {
    if (!size) return data;
    const start = (currentPage - 1) * size;
    return data.slice(start, start + size);
  }, [data, currentPage, size]);

  const handlePageSizeChange = (next: number) => {
    setSize(next);
    setPage(1);
  };

  // Keys of the rows currently shown (the page), for the select-all control.
  const pageIds = selection ? pageData.map(keyExtractor) : [];
  const allSelected =
    !!selection && pageIds.length > 0 && pageIds.every((id) => selection.selectedIds.has(id));
  const colCount = columns.length + (selection ? 1 : 0);

  const showPagination = !!pageSize && !isLoading && data.length > 0;

  const emptyState = (
    <div className="flex flex-col items-center gap-3 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <FileSearch className="h-6 w-6 text-muted-foreground/50" />
      </div>
      <p className="text-sm text-muted-foreground">{emptyMessage}</p>
    </div>
  );

  return (
    <div className="flex flex-col gap-2">
      {exportable && (
        <div className="flex items-center justify-end px-4">
          <ExportButtons
            filename={exportable.filename}
            columns={exportable.columns}
            rows={data}
            disabled={isLoading}
          />
        </div>
      )}
      <div className="rounded-xl border border-border/60 bg-card shadow-card overflow-hidden">

        {/* Mobile: stacked cards (no horizontal scrolling) */}
        <div className="divide-y divide-border/50 md:hidden">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <MobileSkeletonCard key={i} rows={Math.min(columns.length, 4)} />
            ))
          ) : data.length === 0 ? (
            emptyState
          ) : (
            pageData.map((row) => (
              <MobileCard
                key={keyExtractor(row)}
                row={row}
                columns={columns}
                onClick={onRowClick}
                selected={selection?.selectedIds.has(keyExtractor(row))}
                onToggleSelect={selection ? () => selection.onToggle(keyExtractor(row)) : undefined}
              />
            ))
          )}
        </div>

        {/* Desktop: full table */}
        <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent even:bg-transparent">
                {selection && (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={() => selection.onToggleAll(pageIds)}
                      aria-label="Select all rows"
                    />
                  </TableHead>
                )}
                {columns.map((col) => (
                  <TableHead key={String(col.header)} className={col.className}>
                    {col.header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <SkeletonRow key={i} cols={colCount} />
                ))
              ) : data.length === 0 ? (
                <TableRow className="hover:bg-transparent even:bg-transparent">
                  <TableCell colSpan={colCount}>{emptyState}</TableCell>
                </TableRow>
              ) : (
                pageData.map((row) => {
                  const id = keyExtractor(row);
                  return (
                    <TableRow
                      key={id}
                      onClick={() => onRowClick?.(row)}
                      className={cn(onRowClick && "cursor-pointer")}
                    >
                      {selection && (
                        <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selection.selectedIds.has(id)}
                            onCheckedChange={() => selection.onToggle(id)}
                            aria-label="Select row"
                          />
                        </TableCell>
                      )}
                      {columns.map((col) => (
                        <TableCell key={String(col.header)} className={col.className}>
                          {renderCell(col, row)}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {showPagination && (
          <Pagination
            page={currentPage}
            pageSize={size}
            total={data.length}
            onPageChange={setPage}
            onPageSizeChange={handlePageSizeChange}
            pageSizeOptions={pageSizeOptions}
          />
        )}
      </div>
    </div>
  );
};
