import { Label } from "@/components/ui/label";
import { useUnits } from "@/hooks/useUnits";

interface Props {
  /** Facility whose tier-eligible units are offered. */
  facilityId?: string;
  value: string[];
  onChange: (next: string[]) => void;
}

/**
 * Multi-select of the clinical units a clinician works in at a facility.
 * Units are scoped to the facility's tier-eligible catalog.
 */
export const UnitMultiSelect = ({ facilityId, value, onChange }: Props) => {
  const { data: units = [], isLoading } = useUnits(
    { facility_id: facilityId },
    { enabled: !!facilityId }
  );

  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  return (
    <div className="space-y-1.5">
      <Label>
        Clinical units <span className="text-muted-foreground text-xs">(optional)</span>
      </Label>
      {!facilityId ? (
        <p className="text-xs text-muted-foreground">Select a facility first.</p>
      ) : isLoading ? (
        <p className="text-xs text-muted-foreground">Loading units…</p>
      ) : units.length === 0 ? (
        <p className="text-xs text-muted-foreground">No units available for this facility.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {units.map((u) => {
            const selected = value.includes(u.id);
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => toggle(u.id)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition-all ${
                  selected
                    ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200"
                    : "bg-muted text-muted-foreground ring-1 ring-transparent hover:ring-border"
                }`}
              >
                {u.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
