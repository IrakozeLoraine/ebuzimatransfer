import writeXlsxFile from "write-excel-file/browser";

/**
 * A single exportable column: a header plus a function that pulls a plain
 * (non-JSX) value out of a row. Table columns render React nodes, so each page
 * supplies its own flat mapping here for CSV / Excel output.
 */
export interface ExportColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

const cellText = (v: string | number | null | undefined): string =>
  v === null || v === undefined ? "" : String(v);

const triggerDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

/** Download `rows` as a UTF-8 CSV file (`<filename>.csv`). */
export function exportToCsv<T>(filename: string, columns: ExportColumn<T>[], rows: T[]): void {
  const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const lines = [
    columns.map((c) => escape(c.header)).join(","),
    ...rows.map((r) => columns.map((c) => escape(cellText(c.value(r)))).join(",")),
  ];
  // Prepend a UTF-8 BOM so Excel opens accented characters correctly.
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, `${filename}.csv`);
}

/** Download `rows` as a real `.xlsx` file (`<filename>.xlsx`). */
export async function exportToExcel<T>(
  filename: string,
  columns: ExportColumn<T>[],
  rows: T[]
): Promise<void> {
  const header = columns.map((c) => ({ value: c.header, fontWeight: "bold" as const }));
  const body = rows.map((r) =>
    columns.map((c) => {
      const v = c.value(r);
      if (v === null || v === undefined || v === "") return null;
      return typeof v === "number"
        ? { type: Number, value: v }
        : { type: String, value: String(v) };
    })
  );
  await writeXlsxFile([header, ...body], { sheet: "Data" }).toFile(`${filename}.xlsx`);
}
