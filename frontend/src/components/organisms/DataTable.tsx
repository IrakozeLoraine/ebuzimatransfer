import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/utils/cn";
import { FileSearch } from "lucide-react";

export interface Column<T> {
  header: string;
  accessor: keyof T | ((row: T) => React.ReactNode);
  className?: string;
}

interface Props<T> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
  isLoading?: boolean;
  emptyMessage?: string;
  keyExtractor: (row: T) => string;
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

export const DataTable = <T,>({
  columns,
  data,
  onRowClick,
  isLoading,
  emptyMessage = "No data found",
  keyExtractor,
}: Props<T>) => {
  return (
    <div className="rounded-xl border border-border/60 bg-card shadow-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent even:bg-transparent">
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
              <SkeletonRow key={i} cols={columns.length} />
            ))
          ) : data.length === 0 ? (
            <TableRow className="hover:bg-transparent even:bg-transparent">
              <TableCell colSpan={columns.length} className="py-14">
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                    <FileSearch className="h-6 w-6 text-muted-foreground/50" />
                  </div>
                  <p className="text-sm text-muted-foreground">{emptyMessage}</p>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            data.map((row) => (
              <TableRow
                key={keyExtractor(row)}
                onClick={() => onRowClick?.(row)}
                className={cn(onRowClick && "cursor-pointer")}
              >
                {columns.map((col) => (
                  <TableCell key={String(col.header)} className={col.className}>
                    {typeof col.accessor === "function"
                      ? col.accessor(row)
                      : String(row[col.accessor] ?? "")}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
};
