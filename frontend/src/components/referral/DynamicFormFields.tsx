import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Plus, X, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/utils/cn";
import { ADDRESS_KEYS, type FieldDef, type FormSection, type TableColumn } from "@/config/transferForms";
import { AddressPicker } from "./AddressPicker";

type FormData = Record<string, unknown>;
type TableRow = Record<string, string>;

interface Props {
  sections: FormSection[];
  value: FormData;
  onChange: (name: string, value: unknown) => void;
  /** Validation messages keyed by field name (for the required core fields). */
  errors?: Record<string, string>;
}

const inputType = (t: TableColumn["type"]) => (t === "number" ? "number" : t === "time" ? "time" : "text");

/** Renders the form-specific MoH fields for the chosen transfer form into a flat
 *  ``form_data`` map. Pairs with DynamicFormDetails for the read-only view. */
export const DynamicFormFields = ({ sections, value, onChange, errors }: Props) => {
  const str = (name: string) => (value[name] == null ? "" : String(value[name]));
  const arr = (name: string): string[] => (Array.isArray(value[name]) ? (value[name] as string[]) : []);
  const rows = (name: string): TableRow[] => (Array.isArray(value[name]) ? (value[name] as TableRow[]) : []);

  // Sections are collapsed by default and expand once they have data. A user click overrides that per section.
  const [openOverride, setOpenOverride] = useState<Record<string, boolean>>({});

  const fieldFilled = (f: FieldDef): boolean => {
    const v = value[f.name];
    if (f.type === "address") return ADDRESS_KEYS.some((k) => value[k] != null && value[k] !== "");
    if (f.type === "checkbox") return v === true;
    if (f.type === "checkboxGroup") return Array.isArray(v) && v.length > 0;
    if (f.type === "table")
      return (
        Array.isArray(v) &&
        (v as TableRow[]).some((r) =>
          Object.entries(r).some(([k, c]) => !k.startsWith("_") && c != null && c !== "")
        )
      );
    return v != null && v !== "";
  };

  const sectionFilled = (section: FormSection) => section.fields.filter(fieldFilled).length;

  const toggleInList = (name: string, option: string) => {
    const current = arr(name);
    onChange(name, current.includes(option) ? current.filter((o) => o !== option) : [...current, option]);
  };

  const setCell = (field: FieldDef, rowIdx: number, colKey: string, v: string, rowLabel?: string) => {
    const existing = rows(field.name);
    const next = [...existing];
    while (next.length <= rowIdx) next.push({});
    next[rowIdx] = { ...next[rowIdx], [colKey]: v, ...(rowLabel ? { _label: rowLabel } : {}) };
    onChange(field.name, next);
  };

  const renderField = (f: FieldDef) => {
    switch (f.type) {
      case "textarea":
        return (
          <Textarea
            placeholder={f.placeholder}
            value={str(f.name)}
            onChange={(e) => onChange(f.name, e.target.value)}
          />
        );
      case "number":
      case "text":
      case "date":
      case "time":
      case "datetime": {
        const htmlType = f.type === "datetime" ? "datetime-local" : f.type;
        return (
          <div className="flex items-center gap-2">
            <Input
              type={htmlType}
              placeholder={f.placeholder}
              value={str(f.name)}
              disabled={f.readOnly}
              onChange={(e) => onChange(f.name, e.target.value)}
            />
            {f.suffix && <span className="shrink-0 text-xs text-muted-foreground">{f.suffix}</span>}
          </div>
        );
      }
      case "address":
        return <AddressPicker value={value} onChange={onChange} />;
      case "select":
        return (
          <Select value={str(f.name)} onValueChange={(v) => onChange(f.name, v)}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              {f.options?.map((o) => (
                <SelectItem key={o} value={o}>{f.optionLabels?.[o] ?? o}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case "radio":
        return (
          <div className="flex flex-wrap gap-2">
            {f.options?.map((o) => {
              const active = str(f.name) === o;
              return (
                <button
                  key={o}
                  type="button"
                  onClick={() => onChange(f.name, active ? "" : o)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    active
                      ? "border-primary bg-primary text-white"
                      : "border-border bg-background text-foreground hover:bg-muted"
                  )}
                >
                  {f.optionLabels?.[o] ?? o}
                </button>
              );
            })}
          </div>
        );
      case "checkbox":
        return (
          <label className="flex items-center gap-2.5 cursor-pointer">
            <Checkbox checked={value[f.name] === true} onCheckedChange={(v) => onChange(f.name, !!v)} />
            <span className="text-sm">{f.label}</span>
          </label>
        );
      case "checkboxGroup":
        return (
          <div className="flex flex-wrap gap-3">
            {f.options?.map((o) => (
              <label key={o} className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={arr(f.name).includes(o)} onCheckedChange={() => toggleInList(f.name, o)} />
                <span className="text-sm">{o}</span>
              </label>
            ))}
          </div>
        );
      case "table":
        return renderTable(f);
      default:
        return null;
    }
  };

  const renderTable = (f: FieldDef) => {
    const cols = f.columns ?? [];
    // Matrix table with fixed left-hand row labels (e.g. Dose / Date / Time).
    if (f.rowLabels) {
      return (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="border-b border-r p-2 text-left text-xs font-medium text-muted-foreground"></th>
                {cols.map((c) => (
                  <th key={c.key} className="border-b border-r p-2 text-left text-xs font-medium text-muted-foreground">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {f.rowLabels.map((rowLabel, rIdx) => (
                <tr key={rowLabel}>
                  <td className="border-r border-b p-2 text-xs font-medium">{rowLabel}</td>
                  {cols.map((c) => (
                    <td key={c.key} className="border-r border-b p-1">
                      <Input
                        type={inputType(c.type)}
                        value={rows(f.name)[rIdx]?.[c.key] ?? ""}
                        onChange={(e) => setCell(f, rIdx, c.key, e.target.value, rowLabel)}
                        className="h-8 border-0 shadow-none focus-visible:ring-1"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    // Dynamic table — add/remove rows, keeping at least the initial blank rows
    // visible even after the first cell is edited.
    const data = rows(f.name);
    const minRows = f.initialRows ?? 1;
    const display =
      data.length >= minRows
        ? data
        : [...data, ...Array.from({ length: minRows - data.length }, () => ({} as TableRow))];
    return (
      <div className="space-y-2">
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-muted/50">
                {cols.map((c) => (
                  <th key={c.key} className="border-b border-r p-2 text-left text-xs font-medium text-muted-foreground">{c.label}</th>
                ))}
                <th className="border-b p-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {display.map((row, rIdx) => (
                <tr key={rIdx}>
                  {cols.map((c) => (
                    <td key={c.key} className="border-r border-b p-1">
                      <Input
                        type={inputType(c.type)}
                        value={row[c.key] ?? ""}
                        onChange={(e) => setCell(f, rIdx, c.key, e.target.value)}
                        className="h-8 border-0 shadow-none focus-visible:ring-1"
                      />
                    </td>
                  ))}
                  <td className="border-b p-1 text-center">
                    <button
                      type="button"
                      onClick={() => onChange(f.name, display.filter((_, i) => i !== rIdx))}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Remove row"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => onChange(f.name, [...display, {}])}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Add row
        </Button>
      </div>
    );
  };

  return (
    <div className="space-y-2.5">
      {sections.map((section) => {
        const filled = sectionFilled(section);
        const total = section.fields.length;
        const hasError = section.fields.some((f) => errors?.[f.name]);
        // Open when overridden, or (by default) when it has data or a validation error.
        const open = openOverride[section.title] ?? (filled > 0 || hasError);
        return (
          <div key={section.title} className="overflow-hidden rounded-lg border">
            <button
              type="button"
              onClick={() =>
                setOpenOverride((p) => ({ ...p, [section.title]: !(p[section.title] ?? (filled > 0 || hasError)) }))
              }
              className="flex w-full items-center gap-2 bg-muted/40 px-3 py-2.5 text-left hover:bg-muted/60"
            >
              {open ? (
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <span className="flex-1 text-sm font-semibold text-foreground">{section.title}</span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-medium",
                  filled > 0 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                )}
              >
                {filled}/{total} filled
              </span>
            </button>
            {open && (
              <div className="space-y-3 p-3">
                {section.note && <p className="text-xs text-muted-foreground">{section.note}</p>}
                <div className="grid gap-4 sm:grid-cols-2">
                  {section.fields.map((f) => {
                    const fullWidth = f.full || f.type === "table" || f.type === "textarea";
                    if (f.type === "checkbox") {
                      return (
                        <div key={f.name} className={cn(fullWidth && "sm:col-span-2")}>
                          {renderField(f)}
                        </div>
                      );
                    }
                    return (
                      <div key={f.name} className={cn("space-y-1.5", fullWidth && "sm:col-span-2")}>
                        <Label className="text-xs">
                          {f.label}
                          {f.required && <span className="text-destructive"> *</span>}
                        </Label>
                        {renderField(f)}
                        {errors?.[f.name] && <p className="text-xs text-destructive">{errors[f.name]}</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
