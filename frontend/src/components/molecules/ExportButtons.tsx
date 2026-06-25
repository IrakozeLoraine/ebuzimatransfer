import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportToCsv, exportToExcel, type ExportColumn } from "@/utils/export";

interface Props<T> {
  /** Base file name (without extension), e.g. "transfer-requests". */
  filename: string;
  columns: ExportColumn<T>[];
  /** Full (already-filtered) dataset to export — not just the current page. */
  rows: T[];
  /** Disable both buttons (e.g. while data is loading). */
  disabled?: boolean;
}

/** A CSV + Excel download pair that exports `rows` client-side. */
export function ExportButtons<T>({ filename, columns, rows, disabled }: Props<T>) {
  const [busy, setBusy] = useState(false);
  const noData = disabled || rows.length === 0;

  const downloadExcel = async () => {
    setBusy(true);
    try {
      await exportToExcel(filename, columns, rows);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={noData}
        onClick={() => exportToCsv(filename, columns, rows)}
        className="bg-white"
      >
        <Download className="mr-2 h-4 w-4" />
        CSV
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={noData || busy}
        onClick={downloadExcel}
        className="bg-white"
      >
        <Download className="mr-2 h-4 w-4" />
        Excel
      </Button>
    </div>
  );
}
