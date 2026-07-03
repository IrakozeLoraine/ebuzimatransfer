import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ADDRESS_KEYS, getFormDef, type FieldDef, type FormSection } from "@/config/transferForms";

type FormData = Record<string, unknown>;
type TableRow = Record<string, string>;

interface Props {
  formType?: string | null;
  formData: FormData | null | undefined;
  /** Render these sections instead of deriving them from formType (receiving forms). */
  sections?: FormSection[];
  /** Card title; defaults to "<form label> — Details". */
  title?: string;
}

const isEmpty = (v: unknown) =>
  v == null ||
  v === "" ||
  (Array.isArray(v) && (v.length === 0 || v.every((r) => typeof r === "object" && Object.values(r as object).every((c) => c == null || c === ""))));

const rowHasData = (row: TableRow, keys: string[]) => keys.some((k) => row[k] != null && row[k] !== "");

/** Read-only summary of the form-specific MoH fields for a referral, mirroring the
 *  DynamicFormFields layout so each form shows only what its unit needs. */
export const DynamicFormDetails = ({ formType, formData, sections, title }: Props) => {
  const def = getFormDef(formType);
  const allSections = sections ?? def.sections;
  const cardTitle = title ?? `${def.label} — Details`;
  const data = formData ?? {};

  const addressText = () =>
    ADDRESS_KEYS.map((k) => data[k]).filter((x) => x != null && x !== "").join(", ");

  const renderValue = (f: FieldDef) => {
    const v = data[f.name];
    if (f.type === "address") return addressText();
    if (f.type === "checkbox") return v === true ? "Yes" : "No";
    if (f.type === "checkboxGroup" && Array.isArray(v)) return (v as string[]).join(", ");
    if (f.type === "table") return renderTable(f);
    const text = f.optionLabels?.[String(v)] ?? String(v ?? "");
    return f.suffix ? `${text} ${f.suffix}` : text;
  };

  const renderTable = (f: FieldDef) => {
    const cols = f.columns ?? [];
    const colKeys = cols.map((c) => c.key);
    const allRows = (Array.isArray(data[f.name]) ? (data[f.name] as TableRow[]) : []).filter((r) =>
      rowHasData(r, colKeys)
    );
    if (allRows.length === 0) return null;
    const hasLabels = allRows.some((r) => r._label);
    return (
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted/50">
              {hasLabels && <th className="border-b border-r p-2 text-left text-xs font-medium text-muted-foreground"></th>}
              {cols.map((c) => (
                <th key={c.key} className="border-b border-r p-2 text-left text-xs font-medium text-muted-foreground">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allRows.map((row, i) => (
              <tr key={i}>
                {hasLabels && <td className="border-r border-b p-2 text-xs font-medium">{row._label ?? ""}</td>}
                {cols.map((c) => (
                  <td key={c.key} className="border-r border-b p-2">{row[c.key] ?? ""}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const fieldHasData = (f: FieldDef) =>
    f.type === "address" ? addressText() !== "" : !isEmpty(data[f.name]);

  // Only render sections that have at least one filled field.
  const sectionsWithData = allSections
    .map((s) => ({ ...s, fields: s.fields.filter(fieldHasData) }))
    .filter((s) => s.fields.length > 0);

  if (sectionsWithData.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">{cardTitle}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {sectionsWithData.map((section) => (
          <div key={section.title} className="space-y-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{section.title}</h3>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {section.fields.map((f) => {
                const full = f.full || f.type === "table" || f.type === "textarea";
                return (
                  <div key={f.name} className={full ? "sm:col-span-2 space-y-1" : "space-y-1"}>
                    <span className="block text-xs font-medium text-muted-foreground">{f.label}</span>
                    {f.type === "table" ? (
                      renderValue(f)
                    ) : (
                      <span className="block text-sm font-medium text-foreground whitespace-pre-wrap">{renderValue(f)}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
