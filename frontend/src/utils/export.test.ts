import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { exportToCsv, exportToExcel, type ExportColumn } from "./export";

interface Row {
  name: string;
  beds: number | null;
}

const columns: ExportColumn<Row>[] = [
  { header: "Name", value: (r) => r.name },
  { header: "Beds", value: (r) => r.beds },
];

const rows: Row[] = [
  { name: "CHUK", beds: 4 },
  { name: 'King "Faisal"', beds: null },
];

describe("exportToCsv", () => {
  let capturedBlob: Blob | null;
  let anchor: HTMLAnchorElement;

  beforeEach(() => {
    capturedBlob = null;
    // jsdom lacks the object-URL API; stub it and capture the generated blob.
    URL.createObjectURL = vi.fn((blob: Blob) => {
      capturedBlob = blob;
      return "blob:mock";
    }) as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;

    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = realCreate(tag) as HTMLElement;
      if (tag === "a") {
        anchor = el as HTMLAnchorElement;
        anchor.click = vi.fn();
      }
      return el;
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it("names the file with a .csv extension and triggers a download", () => {
    exportToCsv("facilities", columns, rows);
    expect(anchor.download).toBe("facilities.csv");
    expect(anchor.click).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock");
  });

  it("writes a header row, quotes every field and escapes embedded quotes", async () => {
    exportToCsv("facilities", columns, rows);
    const text = await capturedBlob!.text();
    const lines = text.split("\r\n");

    expect(lines[0]).toBe('"Name","Beds"');
    expect(lines[1]).toBe('"CHUK","4"');
    // Embedded quotes are doubled; a null cell becomes an empty quoted string.
    expect(lines[2]).toBe('"King ""Faisal""",""');
  });

  it("prepends a UTF-8 BOM so Excel reads accents correctly", async () => {
    exportToCsv("facilities", columns, rows);
    // Blob.text() decodes UTF-8 and strips a leading BOM, so check the raw bytes.
    const bytes = new Uint8Array(await capturedBlob!.arrayBuffer());
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
  });
});

// The Excel writer is a thin wrapper over write-excel-file; assert we hand it a
// bold header row followed by typed body cells and write to the .xlsx filename.
const toFile = vi.fn().mockResolvedValue(undefined);
const writeXlsxFile = vi.fn(() => ({ toFile }));
vi.mock("write-excel-file/browser", () => ({ default: (...args: unknown[]) => writeXlsxFile(...args) }));

describe("exportToExcel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("builds a bold header, types the body cells and writes the .xlsx file", async () => {
    await exportToExcel("facilities", columns, rows);

    expect(writeXlsxFile).toHaveBeenCalledTimes(1);
    const [data, opts] = writeXlsxFile.mock.calls[0] as [unknown[][], { sheet: string }];

    expect(data[0]).toEqual([
      { value: "Name", fontWeight: "bold" },
      { value: "Beds", fontWeight: "bold" },
    ]);
    // First body row: string name, numeric bed count.
    expect(data[1]).toEqual([
      { type: String, value: "CHUK" },
      { type: Number, value: 4 },
    ]);
    // A null value becomes an empty cell.
    expect(data[2][1]).toBeNull();
    expect(opts.sheet).toBe("Data");
    expect(toFile).toHaveBeenCalledWith("facilities.xlsx");
  });
});
